import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search, TriangleAlert } from 'lucide-react'

import { searchOrders } from '../../lib/api'
import type { AdminOrderListItem, AdminOrderSearchResult, AdminOrderStatusGroup } from '../../lib/types'
import { badgeTone, formatMoney } from '../../lib/format'
import OrderWorkspace from './OrderWorkspace'
import { DATE_PRESETS, dateRange, issueLabel, orderAge, formatTime, type DatePreset } from './orderUtils'

type Tab = 'OPEN' | 'ATTENTION' | 'COMPLETED' | 'CANCELLED' | 'ALL'

const TABS: { key: Tab; label: string; count: (counts: NonNullable<AdminOrderSearchResult['counts']>) => number }[] = [
  { key: 'OPEN', label: 'Open', count: (c) => c.open },
  { key: 'ATTENTION', label: 'Needs attention', count: (c) => c.attention },
  { key: 'COMPLETED', label: 'Completed', count: (c) => c.completed },
  { key: 'CANCELLED', label: 'Cancelled', count: (c) => c.cancelled },
  { key: 'ALL', label: 'All', count: (c) => c.all },
]

const PAGE_SIZE = 20
const LIVE_REFRESH_MS = 30_000

type Props = {
  token: string
  zoneCode: string
  /** An order another screen asked to open (overview, new-order alert). */
  requestedOrderNo: number | null
  onRequestHandled: () => void
  /** Bumped by the app on manual refresh or a new-order alert. */
  refreshSignal: number
  onOrderChanged: () => void
}

/** Orders: a focused queue of open orders by default, searchable, opening into one order's workspace. */
export default function OrdersView({ token, zoneCode, requestedOrderNo, onRequestHandled, refreshSignal, onOrderChanged }: Props) {
  const [tab, setTab] = useState<Tab>('OPEN')
  const [query, setQuery] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('ANY')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [sort, setSort] = useState<'AUTO' | 'NEWEST' | 'OLDEST'>('AUTO')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminOrderSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [openOrderNo, setOpenOrderNo] = useState<number | null>(null)
  const deferredQuery = useDeferredValue(query)
  const requestId = useRef(0)

  // Open queues read first-in, first-out; history reads newest first.
  const effectiveSort = sort === 'AUTO' ? (tab === 'OPEN' || tab === 'ATTENTION' ? 'OLDEST' : 'NEWEST') : sort

  const load = useCallback(
    async (quiet = false) => {
      const id = ++requestId.current
      if (!quiet) setLoading(true)
      try {
        const statusGroup: AdminOrderStatusGroup = tab === 'ATTENTION' ? 'OPEN' : tab
        const next = await searchOrders(token, {
          page,
          pageSize: PAGE_SIZE,
          query: deferredQuery.trim() || undefined,
          zoneCode: zoneCode || undefined,
          statusGroup,
          attention: tab === 'ATTENTION' || undefined,
          paymentStatus: paymentStatus || undefined,
          sort: effectiveSort,
          ...dateRange(datePreset),
        })
        if (id !== requestId.current) return
        setResult(next)
        setError(null)
        setUpdatedAt(new Date())
      } catch (reason) {
        if (id === requestId.current) setError(reason instanceof Error ? reason.message : 'Unable to load orders.')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [datePreset, deferredQuery, effectiveSort, page, paymentStatus, tab, token, zoneCode],
  )

  useEffect(() => {
    void load()
  }, [load])

  // External refresh (manual Refresh button, new-order alert).
  useEffect(() => {
    if (refreshSignal > 0) void load(true)
    // Only react to the signal itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal])

  // Keep the open queue current without hammering the API: only while visible.
  useEffect(() => {
    if (openOrderNo !== null || (tab !== 'OPEN' && tab !== 'ATTENTION')) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load, openOrderNo, tab])

  useEffect(() => {
    if (requestedOrderNo !== null) {
      setOpenOrderNo(requestedOrderNo)
      onRequestHandled()
    }
  }, [onRequestHandled, requestedOrderNo])

  function changeTab(next: Tab) {
    setTab(next)
    setPage(1)
  }

  if (openOrderNo !== null) {
    return (
      <OrderWorkspace
        token={token}
        orderNo={openOrderNo}
        onBack={() => {
          setOpenOrderNo(null)
          void load(true)
        }}
        onChanged={onOrderChanged}
        onSearchCustomer={(term) => {
          setOpenOrderNo(null)
          setTab('ALL')
          setPage(1)
          setQuery(term)
        }}
      />
    )
  }

  const counts = result?.counts
  const total = result?.total ?? 0
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(page * PAGE_SIZE, total)
  const hasFilters = Boolean(query.trim() || datePreset !== 'ANY' || paymentStatus)

  return (
    <section className="orders-view">
      <section className="panel orders-toolbar">
        <nav className="ws-tabs" aria-label="Order status">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'merchant-section-tab is-active' : 'merchant-section-tab'}
              onClick={() => changeTab(key)}
            >
              {key === 'ATTENTION' ? <TriangleAlert size={15} /> : null}
              {label}
              {counts ? (
                <span className={key === 'ATTENTION' && count(counts) > 0 ? 'merchant-count is-alert' : 'merchant-count'}>{count(counts)}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="orders-filters">
          <label className="merchant-search orders-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Order #, customer, phone, email, kitchen or rider"
              aria-label="Search orders"
            />
          </label>
          <select value={datePreset} onChange={(event) => { setDatePreset(event.target.value as DatePreset); setPage(1) }} aria-label="Placed">
            {DATE_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
          </select>
          <select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1) }} aria-label="Payment">
            <option value="">Any payment</option>
            <option value="pending">Payment pending</option>
            <option value="success">Paid</option>
            <option value="failed">Payment failed</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort">
            <option value="AUTO">{tab === 'OPEN' || tab === 'ATTENTION' ? 'Oldest first' : 'Newest first'}</option>
            <option value="NEWEST">Newest first</option>
            <option value="OLDEST">Oldest first</option>
          </select>
          <button className="ghost-button merchant-icon-button" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh orders">
            <RefreshCw className={loading ? 'is-spinning' : undefined} size={17} />
          </button>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="panel orders-table-panel">
        <div className="orders-table">
          <div className="orders-row orders-head" aria-hidden="true">
            <span>Order</span>
            <span>Customer</span>
            <span>Kitchens · rider</span>
            <span>Amount</span>
            <span>Status</span>
          </div>
          {(result?.items ?? []).map((order) => (
            <OrderRow key={order.order_no} order={order} onOpen={() => setOpenOrderNo(order.order_no)} />
          ))}
          {result && result.items.length === 0 ? (
            <div className="orders-empty">
              <strong>{emptyTitle(tab, hasFilters)}</strong>
              <span>{hasFilters ? 'Try a different search or clear the filters.' : emptyHint(tab)}</span>
            </div>
          ) : null}
          {!result && loading ? <p className="muted-line"><LoaderCircle className="is-spinning" size={15} /> Loading orders…</p> : null}
        </div>
        <footer className="orders-footer">
          <span className="muted-line">
            {total ? `${firstRow}–${lastRow} of ${total}` : 'No orders'}
            {updatedAt ? ` · Updated ${updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}
          </span>
          <div className="orders-pager">
            <button className="ghost-button merchant-icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft size={17} />
            </button>
            <button className="ghost-button merchant-icon-button" type="button" disabled={lastRow >= total || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </section>
    </section>
  )
}

function OrderRow({ order, onOpen }: { order: AdminOrderListItem; onOpen: () => void }) {
  const open = !['COMPLETED', 'CANCELLED'].includes(order.order_status.toUpperCase())
  return (
    <button type="button" className="orders-row" onClick={onOpen} aria-label={`Open order ${order.order_no}`}>
      <span className="orders-cell-order">
        <strong>#{order.order_no}</strong>
        <span className="muted-line">{open ? `${orderAge(order.order_placed_on)} ago` : formatTime(order.order_placed_on)}</span>
      </span>
      <span className="orders-cell-stack">
        <strong>{order.customer_name ?? 'Guest customer'}</strong>
        <span className="muted-line">
          {order.customer_mobile ?? 'No phone'}
          {order.service_zone_name ? ` · ${order.service_zone_name.replace(/, Pune$/, '')}` : ''}
        </span>
      </span>
      <span className="orders-cell-stack">
        <span>{order.merchant_names.join(', ') || 'No kitchen yet'}</span>
        <span className="muted-line">{order.rider_names.length ? `Rider: ${order.rider_names.join(', ')}` : open ? 'No rider yet' : '—'}</span>
      </span>
      <span className="orders-cell-stack">
        <strong>{formatMoney(order.payment_amount)}</strong>
        <span className="muted-line">
          {[order.payment_method_type, order.payment_status].filter(Boolean).join(' · ').toLowerCase() || 'no payment'}
        </span>
      </span>
      <span className="orders-cell-status">
        <span className={`badge ${badgeTone(order.order_status)}`}>{order.order_status.replaceAll('_', ' ')}</span>
        {order.issue_flags.map((flag) => (
          <span key={flag} className="badge is-danger orders-flag">{issueLabel(flag)}</span>
        ))}
      </span>
    </button>
  )
}

function emptyTitle(tab: Tab, filtered: boolean): string {
  if (filtered) return 'No orders match'
  switch (tab) {
    case 'OPEN':
      return 'No open orders right now'
    case 'ATTENTION':
      return 'Nothing needs attention'
    case 'COMPLETED':
      return 'No completed orders yet'
    case 'CANCELLED':
      return 'No cancelled orders'
    default:
      return 'No orders yet'
  }
}

function emptyHint(tab: Tab): string {
  return tab === 'OPEN' || tab === 'ATTENTION'
    ? 'New orders appear here automatically.'
    : 'Change the tab or time range to see other orders.'
}
