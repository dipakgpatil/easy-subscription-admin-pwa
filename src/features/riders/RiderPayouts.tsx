import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, LoaderCircle } from 'lucide-react'

import { ApiError, getRiderSettlement, settleRider } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import type { AdminRiderListItem, AdminRiderSettlementView, RiderSettlementMethod } from '../../lib/types'

const METHODS: { value: RiderSettlementMethod; label: string }[] = [
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
]

function methodLabel(value: string): string {
  return METHODS.find((method) => method.value === value)?.label ?? value
}

function amount(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function money(value: number): string {
  return formatMoney(Math.abs(value).toFixed(2))
}

/** Who pays whom, in the words an operator would say. */
function netHeadline(net: number): string {
  if (net > 0) return `Pay the rider ${money(net)}`
  if (net < 0) return `Collect ${money(net)} from the rider`
  return 'Nothing to pay either way'
}

function settledLine(net: number): string {
  if (net > 0) return `Paid ${money(net)}`
  if (net < 0) return `Collected ${money(net)}`
  return 'Evened out'
}

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/**
 * A rider's money with Cravix: delivery earnings owed to them, netted against
 * cash-on-delivery money they hold. Settling records one payment for the net.
 */
export default function RiderPayouts({ token, rider, onSettled }: { token: string; rider: AdminRiderListItem; onSettled: () => void }) {
  const [view, setView] = useState<AdminRiderSettlementView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [method, setMethod] = useState<RiderSettlementMethod>('UPI')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setView(await getRiderSettlement(token, rider.rider_uid))
      setLoadError(null)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Unable to load payouts.')
    }
  }, [rider.rider_uid, token])

  useEffect(() => {
    void load()
  }, [load])

  async function settle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!view) return
    const net = amount(view.pending.net_amount)
    const action =
      net > 0
        ? `Confirm you have paid ${rider.display_name} ${money(net)}`
        : net < 0
          ? `Confirm ${rider.display_name} has handed you ${money(net)}`
          : 'Earnings and cash cancel out'
    const scope = `${view.pending.deliveries_count} deliveries and ${view.pending.cash_orders_count} cash orders will be marked settled.`
    if (!window.confirm(`${action}. ${scope}`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await settleRider(token, rider.rider_uid, {
        paymentMethod: method,
        reference,
        note,
        expectedNetAmount: view.pending.net_amount,
      })
      setView(next)
      setReference('')
      setNote('')
      setMessage(`Settled. ${rider.display_name} can see it in the rider app.`)
      onSettled()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to settle.')
      // The balance moved (a delivery landed) or someone settled it first: show the latest.
      if (reason instanceof ApiError && reason.status === 409) void load()
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="error-banner">{loadError}</p>
  if (view === null) {
    return (
      <section className="panel">
        <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading payouts…</p>
      </section>
    )
  }

  const pending = view.pending
  const net = amount(pending.net_amount)
  const hasPending = pending.deliveries_count > 0 || pending.cash_orders_count > 0

  return (
    <div className="ow-grid">
      <section className="panel">
        <p className="section-kicker">To settle</p>
        <h3 className="ow-heading">{hasPending ? netHeadline(net) : 'All settled'}</h3>
        <dl className="ow-dl">
          <div>
            <dt>Earnings owed</dt>
            <dd>{formatMoney(pending.earnings_amount)} · {pending.deliveries_count} deliver{pending.deliveries_count === 1 ? 'y' : 'ies'}</dd>
          </div>
          <div>
            <dt>Cash with rider</dt>
            <dd>{formatMoney(pending.cash_collected_amount)} · {pending.cash_orders_count} cash order{pending.cash_orders_count === 1 ? '' : 's'}</dd>
          </div>
        </dl>
        {hasPending ? (
          <form className="payout-form" onSubmit={settle}>
            <div className="merchant-form-grid">
              <label>
                Paid by
                <select value={method} onChange={(event) => setMethod(event.target.value as RiderSettlementMethod)}>
                  {METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Reference (optional)
                <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} placeholder="UPI or bank reference" />
              </label>
              <label className="merchant-form-wide">
                Note (optional)
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
              </label>
            </div>
            {error ? <p className="error-banner">{error}</p> : null}
            <div className="merchant-form-actions">
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="is-spinning" size={16} /> : <BadgeCheck size={16} />} Mark as settled
              </button>
            </div>
          </form>
        ) : (
          <p className="muted-line">Earnings appear here after each delivery, and cash after each cash order.</p>
        )}
        {message ? <p className="success-banner">{message}</p> : null}
      </section>

      <section className="panel">
        <p className="section-kicker">Pending items</p>
        {view.pending_items.length === 0 ? <p className="muted-line">Nothing pending.</p> : null}
        <ul className="ow-summary-list payout-items">
          {view.pending_items.map((item) => (
            <li key={`${item.kind}-${item.order_no}-${item.occurred_on}`}>
              <span className="muted-line">{shortDate(item.occurred_on)}</span>
              <span>
                <strong>Order #{item.order_no}</strong>
                <span className="muted-line">{item.kind === 'EARNING' ? 'Delivery earning' : 'Cash collected'}</span>
              </span>
              <span className={item.kind === 'EARNING' ? 'payout-amount is-credit' : 'payout-amount is-debit'}>
                {item.kind === 'EARNING' ? '+' : '−'}{formatMoney(item.amount)}
              </span>
            </li>
          ))}
        </ul>

        <p className="section-kicker ow-subkicker">History</p>
        {view.settlements.length === 0 ? <p className="muted-line">No settlements yet.</p> : null}
        <ul className="ow-summary-list payout-items">
          {view.settlements.map((settlement) => (
            <li key={settlement.settlement_id}>
              <span className="muted-line">{formatDateTime(settlement.settled_at)}</span>
              <span>
                <strong>{settledLine(amount(settlement.net_amount))}</strong>
                <span className="muted-line">
                  {methodLabel(settlement.payment_method)}
                  {settlement.reference ? ` · ${settlement.reference}` : ''} · {settlement.deliveries_count} deliveries, {settlement.cash_orders_count} cash
                </span>
              </span>
              <span className="badge is-positive">Settled</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
