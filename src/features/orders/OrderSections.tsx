import { useEffect, useState } from 'react'
import { Bike, ChefHat, CircleAlert, CircleCheckBig, CircleDot, ExternalLink, LoaderCircle, MapPin, Search, Truck } from 'lucide-react'

import { getOrderActivity } from '../../lib/api'
import type { AdminOrderActivity, AdminOrderDetail, AdminRiderListItem, AdminTimelineStep } from '../../lib/types'
import { badgeTone, formatMoney } from '../../lib/format'
import { ContactAction } from '../../lib/ContactAction'
import { ACTION_LABELS, ISSUES, formatTime, nextSteps, stageLabel, type OrderSection } from './orderUtils'

function StepIcon({ step }: { step: AdminTimelineStep }) {
  const status = step.status.toUpperCase()
  if (status === 'COMPLETED') return <CircleCheckBig size={16} className="ow-step-done" aria-hidden="true" />
  if (status.startsWith('IN')) return <CircleDot size={16} className="ow-step-active" aria-hidden="true" />
  return <CircleDot size={16} className="ow-step-pending" aria-hidden="true" />
}

function Steps({ steps }: { steps: AdminTimelineStep[] }) {
  return (
    <ol className="ow-steps">
      {steps.map((step) => (
        <li key={step.label} className={`ow-step is-${step.status.toLowerCase().replaceAll('_', '-')}`}>
          <StepIcon step={step} />
          <span className="ow-step-label">{step.label}</span>
          <span className="muted-line">
            {step.timestamp ? formatTime(step.timestamp) : step.status.toUpperCase().startsWith('IN') ? 'in progress' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function OverviewSection({ order, onOpenSection }: { order: AdminOrderDetail; onOpenSection: (section: OrderSection) => void }) {
  return (
    <div className="ow-grid">
      <section className="panel">
        <p className="section-kicker">Journey</p>
        <h3 className="ow-heading">{stageLabel(order.journey, order.order_status)}</h3>
        {order.journey ? <Steps steps={order.journey.steps} /> : <p className="muted-line">No journey recorded.</p>}
      </section>

      <div className="ow-stack">
        <section className="panel">
          <p className="section-kicker">Needs attention</p>
          {order.issue_flags.length === 0 ? (
            <p className="ow-ok"><CircleCheckBig size={16} /> Nothing needs attention.</p>
          ) : (
            <ul className="ow-issues">
              {order.issue_flags.map((flag) => {
                const issue = ISSUES[flag]
                return (
                  <li key={flag}>
                    <CircleAlert size={16} aria-hidden="true" />
                    <div>
                      <strong>{issue?.label ?? flag}</strong>
                      <span className="muted-line">{issue?.hint ?? ''}</span>
                    </div>
                    {issue ? (
                      <button className="ghost-button" type="button" onClick={() => onOpenSection(issue.section)}>{issue.action}</button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <p className="section-kicker">Kitchens</p>
          <ul className="ow-summary-list">
            {order.fulfillment_groups.map((group) => (
              <li key={group.wo_no}>
                <ChefHat size={16} aria-hidden="true" />
                <span>
                  <strong>{group.merchant?.display_name ?? 'No kitchen'}</strong>
                  <span className="muted-line">#{group.wo_no} · {group.items.length} item{group.items.length === 1 ? '' : 's'} · {formatMoney(group.subtotal_amount)}</span>
                </span>
                <span className={`badge ${badgeTone(group.order_status)}`}>{group.order_status.replaceAll('_', ' ')}</span>
              </li>
            ))}
          </ul>
          <button className="ghost-button ow-link-button" type="button" onClick={() => onOpenSection('kitchens')}>Open kitchens</button>
        </section>
      </div>
    </div>
  )
}

export function KitchensSection({
  order,
  busy,
  onMove,
  onAssignRider,
}: {
  order: AdminOrderDetail
  busy: string | null
  onMove: (woNo: number, status: string) => void
  onAssignRider: () => void
}) {
  return (
    <div className="ow-stack">
      {order.fulfillment_groups.map((group) => {
        const steps = nextSteps(group.order_status)
        return (
          <section key={group.wo_no} className="panel ow-kitchen">
            <header className="ow-kitchen-head">
              <div>
                <p className="section-kicker">Kitchen order #{group.wo_no}</p>
                <h3 className="ow-heading">{group.merchant?.display_name ?? 'No kitchen assigned'}</h3>
                <p className="muted-line">
                  {group.merchant?.location_label ?? 'No location label'}
                  {group.estimated_prep_minutes ? ` · ${group.estimated_prep_minutes} min prep` : ''}
                </p>
              </div>
              <span className={`badge ${badgeTone(group.order_status)}`}>{group.order_status.replaceAll('_', ' ')}</span>
            </header>
            {group.merchant ? <ContactAction label={group.merchant.display_name} mobileNo={group.merchant.mobile_no} /> : null}

            <div className="ow-kitchen-body">
              <div>
                <p className="section-kicker">Items</p>
                <ul className="ow-items">
                  {group.items.map((item) => (
                    <li key={item.item_no}>
                      <span>{item.product_name}</span>
                      <strong>× {Number(item.quantity)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="ow-subtotal">Subtotal <strong>{formatMoney(group.subtotal_amount)}</strong></p>
              </div>
              <div>
                <p className="section-kicker">Progress</p>
                <Steps steps={group.timeline} />
              </div>
            </div>

            {steps.length ? (
              <footer className="ow-actions">
                <span className="muted-line">Move to</span>
                {steps.map((status) =>
                  status === 'ASSIGNED' ? (
                    <button key={status} className="ghost-button" type="button" onClick={onAssignRider} disabled={busy !== null}>
                      <Bike size={15} /> {ACTION_LABELS[status]}
                    </button>
                  ) : (
                    <button
                      key={status}
                      className={status === steps[0] ? 'primary-button' : 'ghost-button'}
                      type="button"
                      onClick={() => {
                        if (status === 'COMPLETED' && !window.confirm(`Mark kitchen order #${group.wo_no} as delivered?`)) return
                        onMove(group.wo_no, status)
                      }}
                      disabled={busy !== null}
                    >
                      {busy === `${group.wo_no}:${status}` ? <LoaderCircle className="is-spinning" size={15} /> : null}
                      {ACTION_LABELS[status] ?? status}
                    </button>
                  ),
                )}
              </footer>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export function DeliverySection({
  order,
  riders,
  busy,
  onAssign,
}: {
  order: AdminOrderDetail
  riders: AdminRiderListItem[] | null
  busy: string | null
  onAssign: (riderUid: number) => void
}) {
  const [riderUid, setRiderUid] = useState('')
  const rider = order.journey?.rider ?? order.fulfillment_groups.find((group) => group.rider)?.rider ?? null
  const zone = order.delivery.service_zone_code
  const unassigned = order.fulfillment_groups.filter(
    (group) => !['ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'].includes(group.order_status.toUpperCase()),
  )
  const candidates = [...(riders ?? [])].sort((a, b) => {
    const score = (r: AdminRiderListItem) =>
      (r.availability_status === 'ONLINE' ? 0 : 2) + (zone && r.service_zone_codes.includes(zone) ? 0 : 1)
    return score(a) - score(b)
  })
  const { latitude, longitude } = order.delivery

  return (
    <div className="ow-grid">
      <section className="panel">
        <p className="section-kicker">Deliver to</p>
        <h3 className="ow-heading">{order.customer.name ?? 'Customer'}</h3>
        <p>{order.delivery.full_address ?? 'No address saved'}</p>
        <p className="muted-line">
          {order.delivery.address_label ? `${order.delivery.address_label} · ` : ''}
          {order.delivery.service_zone_name ?? order.delivery.service_zone_code ?? 'No zone'}
        </p>
        {latitude != null && longitude != null ? (
          <a className="maps-link" href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer">
            <MapPin size={14} /> Open on Google Maps <ExternalLink size={12} />
          </a>
        ) : null}
        {order.journey?.dispatch_status ? (
          <p className="ow-dispatch">
            <Truck size={15} /> Dispatch: <span className={`badge ${badgeTone(order.journey.dispatch_status)}`}>{order.journey.dispatch_status.replaceAll('_', ' ')}</span>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <p className="section-kicker">Rider</p>
        {rider ? (
          <>
            <h3 className="ow-heading">{rider.display_name}</h3>
            <p className="muted-line">
              <span className={`badge ${badgeTone(rider.availability_status)}`}>{rider.availability_status}</span>{' '}
              {rider.location_updated_at ? `Location ${formatTime(rider.location_updated_at)}` : 'No live location yet'}
            </p>
            <div className="ow-actions">
              <ContactAction label={rider.display_name} mobileNo={rider.mobile_no} />
              {rider.latitude != null && rider.longitude != null ? (
                <a className="maps-link" href={`https://www.google.com/maps?q=${rider.latitude},${rider.longitude}`} target="_blank" rel="noreferrer">
                  <MapPin size={14} /> Rider's live location
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted-line">No rider has this order yet.</p>
        )}

        {unassigned.length ? (
          <div className="ow-assign">
            <p className="section-kicker">{rider ? 'Assign remaining kitchen orders' : 'Assign a rider'}</p>
            {riders === null ? (
              <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading riders…</p>
            ) : candidates.length === 0 ? (
              <p className="muted-line">No riders are sharing a live location right now.</p>
            ) : (
              <div className="ow-actions">
                <select value={riderUid} onChange={(event) => setRiderUid(event.target.value)} aria-label="Rider">
                  <option value="">Choose a rider</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.rider_uid} value={candidate.rider_uid}>
                      {candidate.display_name} · {candidate.availability_status.toLowerCase()}
                      {zone && candidate.service_zone_codes.includes(zone) ? ' · this zone' : ''}
                      {candidate.active_order_no ? ` · on #${candidate.active_order_no}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!riderUid || busy !== null}
                  onClick={() => onAssign(Number(riderUid))}
                >
                  {busy === 'assign' ? <LoaderCircle className="is-spinning" size={15} /> : <Bike size={15} />}
                  Assign to {unassigned.length} kitchen order{unassigned.length === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function CustomerSection({ order, onSearchCustomer }: { order: AdminOrderDetail; onSearchCustomer: (term: string) => void }) {
  const lookup = order.customer.mobile_no ?? order.customer.email_address ?? order.customer.name
  const payouts = order.fulfillment_groups.filter((group) => group.payout_amount)
  return (
    <div className="ow-grid">
      <section className="panel">
        <p className="section-kicker">Customer</p>
        <h3 className="ow-heading">{order.customer.name ?? 'Guest customer'}</h3>
        <dl className="ow-dl">
          <div><dt>Phone</dt><dd>{order.customer.mobile_no ?? '—'}</dd></div>
          <div><dt>Email</dt><dd>{order.customer.email_address ?? '—'}</dd></div>
          <div><dt>Address</dt><dd>{order.delivery.full_address ?? '—'}</dd></div>
        </dl>
        <div className="ow-actions">
          {order.customer.mobile_no ? <ContactAction label="customer" mobileNo={order.customer.mobile_no} /> : null}
          {lookup ? (
            <button className="ghost-button" type="button" onClick={() => onSearchCustomer(lookup)}>
              <Search size={15} /> Their other orders
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <p className="section-kicker">Payment</p>
        <h3 className="ow-heading">{formatMoney(order.payment.payment_amount)}</h3>
        <dl className="ow-dl">
          <div>
            <dt>Status</dt>
            <dd><span className={`badge ${badgeTone(order.payment.payment_status)}`}>{order.payment.payment_status ?? 'no payment'}</span></dd>
          </div>
          <div><dt>Method</dt><dd>{order.payment.payment_method_type ?? '—'}</dd></div>
          <div><dt>Paid</dt><dd>{order.payment.payment_date ? formatTime(order.payment.payment_date) : '—'}</dd></div>
          <div><dt>Gateway ref</dt><dd>{order.payment.gateway_order_no ?? '—'}</dd></div>
        </dl>
        <p className="section-kicker ow-subkicker">By kitchen</p>
        <ul className="ow-items">
          {order.fulfillment_groups.map((group) => (
            <li key={group.wo_no}>
              <span>{group.merchant?.display_name ?? `#${group.wo_no}`}</span>
              <strong>{formatMoney(group.subtotal_amount)}</strong>
            </li>
          ))}
        </ul>
        {payouts.length ? (
          <>
            <p className="section-kicker ow-subkicker">Rider payout</p>
            <ul className="ow-items">
              {payouts.map((group) => (
                <li key={group.wo_no}>
                  <span>{group.rider?.display_name ?? `#${group.wo_no}`} · {(group.payout_status ?? '').toLowerCase()}</span>
                  <strong>{formatMoney(group.payout_amount)}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  )
}

export function ActivitySection({ token, orderNo }: { token: string; orderNo: number }) {
  const [events, setEvents] = useState<AdminOrderActivity[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOrderActivity(token, orderNo)
      .then((result) => !cancelled && setEvents(result))
      .catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : 'Unable to load activity.'))
    return () => {
      cancelled = true
    }
  }, [orderNo, token])

  return (
    <section className="panel">
      <p className="section-kicker">Activity</p>
      {error ? <p className="error-banner">{error}</p> : null}
      {events === null && !error ? <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading…</p> : null}
      {events && events.length === 0 ? <p className="muted-line">No activity recorded for this order.</p> : null}
      {events && events.length ? (
        <ol className="ow-activity">
          {events.map((event) => (
            <li key={event.id}>
              <span className="ow-activity-time">{formatTime(event.occurred_at)}</span>
              <span className="ow-activity-dot" aria-hidden="true" />
              <span>
                <strong>{event.label}</strong>
                <span className="muted-line">
                  {event.subject}
                  {event.actor_name ? ` · by ${event.actor_name}` : ''}
                  {event.details.order_status ? ` · → ${String(event.details.order_status).replaceAll('_', ' ').toLowerCase()}` : ''}
                  {event.details.test_pin_used ? ' · test PIN used' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
