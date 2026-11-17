import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, LoaderCircle } from 'lucide-react'

import { ApiError, getMerchantPayoutDetail, settleMerchant } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import type { AdminMerchantPayoutDetail, AdminMerchantPayoutOrder } from '../../lib/types'
import SettlementPaymentFields from './SettlementPaymentFields'
import {
  formatDay,
  indiaDay,
  indiaToday,
  methodLabel,
  newPaymentDraft,
  sumAmounts,
  type PaymentDraft,
} from './settlementPayment'

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function dayRange(from: string, to: string): string {
  return from === to ? formatDay(from) : `${shortDay(from)} – ${formatDay(to)}`
}

/** The India-time day an order became payable: when the kitchen completed it. */
function earnedDay(order: AdminMerchantPayoutOrder): string {
  return indiaDay(order.earned_at) ?? indiaDay(order.order_placed_on) ?? indiaToday()
}

/**
 * A kitchen's money with Cravix: completed orders not yet paid for, and past payments. Recording a
 * payment settles exactly the orders listed under it, up to the chosen day, so a weekly cycle can be
 * paid while the kitchen keeps completing orders.
 */
export default function MerchantPayouts({
  token,
  merchantUid,
  onSettled,
}: {
  token: string
  merchantUid: number
  onSettled: () => void
}) {
  const [detail, setDetail] = useState<AdminMerchantPayoutDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [upTo, setUpTo] = useState(indiaToday)
  const [draft, setDraft] = useState<PaymentDraft>(() => newPaymentDraft('BANK_TRANSFER'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDetail(await getMerchantPayoutDetail(token, merchantUid))
      setLoadError(null)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Unable to load payouts.')
    }
  }, [merchantUid, token])

  useEffect(() => {
    void load()
  }, [load])

  const pending = useMemo(
    () =>
      (detail?.orders ?? [])
        .filter((order) => order.payout_status === 'PENDING')
        .map((order) => ({ order, day: earnedDay(order) }))
        .sort((a, b) => a.day.localeCompare(b.day) || a.order.wo_no - b.order.wo_no),
    [detail],
  )
  const included = pending.filter((row) => row.day <= upTo)
  const waiting = pending.length - included.length
  const total = sumAmounts(included.map((row) => row.order.payout_amount))
  const totalNumber = Number.parseFloat(total)

  async function settle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || included.length === 0) return
    const name = detail.summary.merchant_name
    const range = dayRange(included[0].day, included[included.length - 1].day)
    const how = `${methodLabel(draft.method)}${draft.reference.trim() ? `, ${draft.reference.trim()}` : ''}`
    const confirmText =
      `Confirm you have paid ${name} ${formatMoney(total)} on ${formatDay(draft.paidOn)} by ${how}. ` +
      `${included.length} order${included.length === 1 ? '' : 's'} completed ${range} will be marked paid.`
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await settleMerchant(token, merchantUid, {
        woNos: included.map((row) => row.order.wo_no),
        expectedAmount: total,
        paymentMethod: draft.method,
        reference: draft.reference,
        paidOn: draft.paidOn,
        note: draft.note,
      })
      setDetail(next)
      // The cycle just paid is done; show everything still due.
      setUpTo(indiaToday())
      setDraft(newPaymentDraft(draft.method))
      setMessage(`Recorded ${formatMoney(total)} to ${name} for ${included.length} order${included.length === 1 ? '' : 's'}.`)
      onSettled()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record the payment.')
      // An order changed or someone recorded it first: show the latest list.
      if (reason instanceof ApiError && reason.status === 409) void load()
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="error-banner">{loadError}</p>
  if (detail === null) {
    return <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading payouts…</p>
  }

  const summary = detail.summary
  const settlements = detail.settlements ?? []

  return (
    <>
      <div className="panel-head">
        <div>
          <p className="section-kicker">Merchant payout</p>
          <h2>{summary.merchant_name}</h2>
        </div>
        <span className={pending.length ? 'badge is-warning' : 'badge is-positive'}>
          {pending.length ? `${formatMoney(summary.pending_payout_amount)} due` : 'All paid'}
        </span>
      </div>

      <div className="ow-grid">
        <section className="panel">
          <p className="section-kicker">Record a payment</p>
          <h3 className="ow-heading">
            {included.length ? `Pay ${formatMoney(total)} for ${included.length} order${included.length === 1 ? '' : 's'}` : 'Nothing to pay'}
          </h3>
          {pending.length ? (
            <form className="payout-form" onSubmit={settle}>
              <div className="merchant-form-grid">
                <label className="merchant-form-wide">
                  Orders completed up to
                  <input type="date" value={upTo} max={indiaToday()} required onChange={(event) => setUpTo(event.target.value)} />
                </label>
                <SettlementPaymentFields draft={draft} amount={totalNumber} onChange={setDraft} />
              </div>
              {waiting ? (
                <p className="muted-line">
                  {waiting === 1 ? '1 later order' : `${waiting} later orders`} (
                  {formatMoney(sumAmounts(pending.filter((row) => row.day > upTo).map((row) => row.order.payout_amount)))})
                  {waiting === 1 ? ' waits' : ' wait'} for the next payment.
                </p>
              ) : null}
              {error ? <p className="error-banner">{error}</p> : null}
              <div className="merchant-form-actions">
                <button className="primary-button" type="submit" disabled={busy || included.length === 0}>
                  {busy ? <LoaderCircle className="is-spinning" size={16} /> : <BadgeCheck size={16} />} Record payment
                </button>
              </div>
            </form>
          ) : (
            <p className="muted-line">Orders appear here once the kitchen completes them.</p>
          )}
          {message ? <p className="success-banner">{message}</p> : null}

          <p className="section-kicker ow-subkicker">Orders in this payment</p>
          {included.length === 0 ? <p className="muted-line">None.</p> : null}
          <ul className="ow-summary-list payout-items">
            {included.map(({ order, day }) => (
              <li key={order.wo_no}>
                <span className="muted-line">{shortDay(day)}</span>
                <span>
                  {/* The customer's number; wo_no is this kitchen's ticket (older APIs sent only that). */}
                  <strong>Order #{order.order_no ?? order.wo_no}</strong>
                  <span className="muted-line">{order.customer_name ?? 'Guest'}</span>
                </span>
                <span className="payout-amount is-credit">{formatMoney(order.payout_amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <p className="section-kicker">Paid so far</p>
          <dl className="ow-dl">
            <div>
              <dt>Paid</dt>
              <dd>{formatMoney(summary.paid_payout_amount)}</dd>
            </div>
            <div>
              <dt>Earned in total</dt>
              <dd>{formatMoney(summary.total_payout_amount)} · {summary.completed_orders} orders</dd>
            </div>
            <div>
              <dt>Last paid</dt>
              {/* The day the money moved; orders marked paid before payments were recorded have only a time. */}
              <dd>{settlements[0] ? formatDay(settlements[0].paid_on) : summary.last_paid_at ? formatDateTime(summary.last_paid_at) : 'Never'}</dd>
            </div>
          </dl>

          <p className="section-kicker ow-subkicker">Payments</p>
          {settlements.length === 0 ? <p className="muted-line">No payments recorded yet.</p> : null}
          <ul className="ow-summary-list payout-items">
            {settlements.map((settlement) => (
              <li key={settlement.settlement_id}>
                <span className="muted-line">{shortDay(settlement.paid_on)}</span>
                <span>
                  <strong>{formatMoney(settlement.amount)}</strong>
                  <span className="muted-line">
                    {methodLabel(settlement.payment_method)}
                    {settlement.reference ? ` · ${settlement.reference}` : ''} · {settlement.orders_count} order
                    {settlement.orders_count === 1 ? '' : 's'}, {dayRange(settlement.orders_from, settlement.orders_to)}
                  </span>
                  {settlement.note ? <span className="muted-line">{settlement.note}</span> : null}
                </span>
                <span className="badge is-positive">Paid</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
