import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Bike,
  ChefHat,
  CircleAlert,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  UserRound,
} from 'lucide-react'

import { getOrderDetail, getRiders, updateOrderStatus } from '../../lib/api'
import type { AdminOrderDetail, AdminRiderListItem } from '../../lib/types'
import { badgeTone, formatMoney } from '../../lib/format'
import { ContactAction } from '../../lib/ContactAction'
import { ActivitySection, CustomerSection, DeliverySection, KitchensSection, OverviewSection } from './OrderSections'
import { formatTime, isFinished, issueLabel, orderAge, stageLabel, type OrderSection } from './orderUtils'

type Props = {
  token: string
  orderNo: number
  onBack: () => void
  onChanged: () => void
  onSearchCustomer: (term: string) => void
}

const SECTIONS: { key: OrderSection; label: string; icon: typeof ChefHat }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'kitchens', label: 'Kitchens', icon: ChefHat },
  { key: 'delivery', label: 'Delivery & rider', icon: Bike },
  { key: 'customer', label: 'Customer & payment', icon: UserRound },
  { key: 'activity', label: 'Activity', icon: Activity },
]

const LIVE_REFRESH_MS = 30_000

/** One order: key facts on top, then one focused section at a time. */
export default function OrderWorkspace({ token, orderNo, onBack, onChanged, onSearchCustomer }: Props) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [section, setSection] = useState<OrderSection>('overview')
  const [riders, setRiders] = useState<AdminRiderListItem[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setOrder(await getOrderDetail(token, orderNo))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load this order.')
    } finally {
      setRefreshing(false)
    }
  }, [orderNo, token])

  useEffect(() => {
    setOrder(null)
    setSection('overview')
    void load()
  }, [load])

  // Open orders keep moving; refresh them quietly while on screen.
  useEffect(() => {
    if (!order || isFinished(order.order_status)) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load, order])

  // Riders are only needed for assignment: fetch when the delivery section opens.
  useEffect(() => {
    if (section !== 'delivery' || riders !== null) return
    getRiders(token, true)
      .then((result) => setRiders(result.items))
      .catch(() => setRiders([]))
  }, [riders, section, token])

  async function move(woNo: number, status: string, riderUid?: number) {
    setBusy(`${woNo}:${status}`)
    setError(null)
    setMessage(null)
    try {
      await updateOrderStatus(token, woNo, { orderStatus: status, riderUid })
      await load()
      onChanged()
      setMessage('Order updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the order.')
    } finally {
      setBusy(null)
    }
  }

  async function assignRider(riderUid: number) {
    if (!order) return
    const targets = order.fulfillment_groups.filter(
      (group) => !['ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].includes(group.order_status.toUpperCase()),
    )
    setBusy('assign')
    setError(null)
    setMessage(null)
    try {
      for (const group of targets) {
        await updateOrderStatus(token, group.wo_no, { orderStatus: 'ASSIGNED', riderUid })
      }
      await load()
      onChanged()
      setMessage(`Rider assigned to ${targets.length} kitchen order${targets.length === 1 ? '' : 's'}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to assign the rider.')
    } finally {
      setBusy(null)
    }
  }

  if (!order) {
    return (
      <section className="panel">
        <button className="ghost-button merchant-back" type="button" onClick={onBack}><ArrowLeft size={16} /> All orders</button>
        {error ? <p className="error-banner">{error}</p> : <p className="muted-line"><LoaderCircle className="is-spinning" size={16} /> Loading order #{orderNo}…</p>}
      </section>
    )
  }

  const finished = isFinished(order.order_status)
  const kitchens = order.fulfillment_groups.length
  const rider = order.journey?.rider ?? order.fulfillment_groups.find((group) => group.rider)?.rider ?? null

  return (
    <section className="order-ws">
      <header className="panel order-ws-header">
        <div className="order-ws-topline">
          <button className="ghost-button merchant-back" type="button" onClick={onBack}><ArrowLeft size={16} /> All orders</button>
          <button className="ghost-button merchant-icon-button" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh order">
            <RefreshCw className={refreshing ? 'is-spinning' : undefined} size={17} />
          </button>
        </div>
        <div className="order-ws-title">
          <h2>Order #{order.order_no}</h2>
          <span className={`badge ${badgeTone(order.order_status)}`}>{order.order_status.replaceAll('_', ' ')}</span>
          {order.issue_flags.map((flag) => (
            <span key={flag} className="badge is-danger"><CircleAlert size={12} /> {issueLabel(flag)}</span>
          ))}
        </div>
        <dl className="order-ws-facts">
          <div>
            <dt>Placed</dt>
            <dd>{formatTime(order.order_placed_on)}{finished ? '' : ` · ${orderAge(order.order_placed_on)} ago`}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{stageLabel(order.journey, order.order_status)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(order.payment.payment_amount)} · {(order.payment.payment_method_type ?? 'unknown').toLowerCase()}</dd>
          </div>
          <div>
            <dt>Zone</dt>
            <dd>{order.delivery.service_zone_name ?? order.delivery.service_zone_code ?? 'No zone'}</dd>
          </div>
          <div>
            <dt>Rider</dt>
            <dd>{rider?.display_name ?? (finished ? '—' : 'Not assigned')}</dd>
          </div>
        </dl>
        <div className="order-ws-contacts">
          {order.customer.mobile_no ? <ContactAction label="customer" mobileNo={order.customer.mobile_no} /> : null}
          {rider?.mobile_no ? <ContactAction label="rider" mobileNo={rider.mobile_no} /> : null}
        </div>
        <nav className="ws-tabs order-ws-sections" aria-label="Order sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={section === key ? 'merchant-section-tab is-active' : 'merchant-section-tab'}
              onClick={() => setSection(key)}
            >
              <Icon size={16} /> {label}
              {key === 'kitchens' ? <span className="merchant-count">{kitchens}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}

      {section === 'overview' ? <OverviewSection order={order} onOpenSection={setSection} /> : null}
      {section === 'kitchens' ? (
        <KitchensSection order={order} busy={busy} onMove={(woNo, status) => void move(woNo, status)} onAssignRider={() => setSection('delivery')} />
      ) : null}
      {section === 'delivery' ? (
        <DeliverySection order={order} riders={riders} busy={busy} onAssign={(riderUid) => void assignRider(riderUid)} />
      ) : null}
      {section === 'customer' ? <CustomerSection order={order} onSearchCustomer={onSearchCustomer} /> : null}
      {section === 'activity' ? <ActivitySection token={token} orderNo={order.order_no} /> : null}
    </section>
  )
}
