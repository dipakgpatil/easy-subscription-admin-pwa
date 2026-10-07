import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, LayoutDashboard, LoaderCircle, Map as MapIcon, MapPin, Save, ShieldCheck, ShieldOff, UserRound } from 'lucide-react'

import { searchOrders, updateRider, updateRiderStatus } from '../../lib/api'
import { ContactAction } from '../../lib/ContactAction'
import { badgeTone, formatMoney } from '../../lib/format'
import type { AdminOrderListItem, AdminRiderListItem, AdminServiceZone } from '../../lib/types'
import { formatTime } from '../orders/orderUtils'
import { locationIsFresh, riderBucket, seenAgo, vehicleLabel, VEHICLES } from './riderUtils'

type Section = 'overview' | 'profile' | 'zones'

type Props = {
  token: string
  rider: AdminRiderListItem
  zones: AdminServiceZone[]
  onBack: () => void
  onChanged: () => void
  onOpenOrder: (orderNo: number) => void
}

const STATE_LABEL = { ONLINE: 'Online', BUSY: 'On delivery', OFFLINE: 'Offline', SUSPENDED: 'Suspended' } as const
const STATE_TONE = { ONLINE: 'is-positive', BUSY: 'is-info', OFFLINE: 'is-neutral', SUSPENDED: 'is-danger' } as const

/** One rider: live state on top, then profile and zones. */
export default function RiderWorkspace({ token, rider, zones, onBack, onChanged, onOpenOrder }: Props) {
  const [section, setSection] = useState<Section>('overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const bucket = riderBucket(rider)
  const active = rider.status_cd === 'ACTIVE'

  async function toggleAccess() {
    const next = active ? 'SUSPENDED' : 'ACTIVE'
    if (next === 'SUSPENDED' && !window.confirm(`Suspend ${rider.display_name}? They are signed out and stop receiving orders.`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updateRiderStatus(token, rider.rider_uid, next)
      setMessage(next === 'ACTIVE' ? `${rider.display_name} can deliver again.` : `${rider.display_name} is suspended.`)
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="order-ws">
      <header className="panel order-ws-header">
        <div className="order-ws-topline">
          <button className="ghost-button merchant-back" type="button" onClick={onBack}><ArrowLeft size={16} /> All riders</button>
          <button
            className={active ? 'ghost-button danger-button' : 'primary-button'}
            type="button"
            onClick={() => void toggleAccess()}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="is-spinning" size={15} /> : active ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
            {active ? 'Suspend' : 'Activate'}
          </button>
        </div>
        <div className="order-ws-title">
          <span className={`rider-avatar-dot is-${bucket.toLowerCase()} is-large`} aria-hidden="true">{rider.display_name.slice(0, 1).toUpperCase()}</span>
          <h2>{rider.display_name}</h2>
          <span className={`badge ${STATE_TONE[bucket]}`}>{STATE_LABEL[bucket]}</span>
          {!rider.google_linked ? <span className="badge is-neutral">Not signed in yet</span> : null}
        </div>
        <dl className="order-ws-facts">
          <div><dt>Vehicle</dt><dd>{vehicleLabel(rider.vehicle_type)}</dd></div>
          <div><dt>Location</dt><dd>{rider.location_updated_at ? seenAgo(rider.location_updated_at) : 'Never shared'}</dd></div>
          <div><dt>Current order</dt><dd>{rider.active_order_no ? `#${rider.active_order_no}` : 'None'}</dd></div>
          <div><dt>Payout per order</dt><dd>{formatMoney(rider.default_payout_amount)}</dd></div>
          <div><dt>Pending payout</dt><dd>{formatMoney(rider.pending_payout_amount)}</dd></div>
        </dl>
        <div className="order-ws-contacts">
          <ContactAction label={rider.display_name} mobileNo={rider.mobile_no} />
        </div>
        <nav className="ws-tabs order-ws-sections" aria-label="Rider sections">
          {[
            { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { key: 'profile' as const, label: 'Profile', icon: UserRound },
            { key: 'zones' as const, label: 'Delivery zones', icon: MapIcon },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={section === key ? 'merchant-section-tab is-active' : 'merchant-section-tab'}
              onClick={() => setSection(key)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}

      {section === 'overview' ? <RiderOverview token={token} rider={rider} onOpenOrder={onOpenOrder} /> : null}
      {section === 'profile' ? <RiderProfileForm token={token} rider={rider} onSaved={onChanged} /> : null}
      {section === 'zones' ? <RiderZonesForm token={token} rider={rider} zones={zones} onSaved={onChanged} /> : null}
    </section>
  )
}

function RiderOverview({ token, rider, onOpenOrder }: { token: string; rider: AdminRiderListItem; onOpenOrder: (orderNo: number) => void }) {
  const [recent, setRecent] = useState<AdminOrderListItem[] | null>(null)
  const fresh = locationIsFresh(rider.location_updated_at)

  useEffect(() => {
    let cancelled = false
    searchOrders(token, { riderUid: rider.rider_uid, pageSize: 8, sort: 'NEWEST' })
      .then((result) => !cancelled && setRecent(result.items))
      .catch(() => !cancelled && setRecent([]))
    return () => {
      cancelled = true
    }
  }, [rider.rider_uid, rider.active_order_no, token])

  return (
    <div className="ow-grid">
      <section className="panel">
        <p className="section-kicker">Right now</p>
        <h3 className="ow-heading">{STATE_LABEL[riderBucket(rider)]}</h3>
        <dl className="ow-dl">
          <div>
            <dt>Last location</dt>
            <dd>
              <span className={fresh ? 'rider-seen is-fresh' : 'rider-seen'}>
                <MapPin size={13} /> {rider.location_updated_at ? `${seenAgo(rider.location_updated_at)}${fresh ? '' : ' (stale)'}` : 'Never shared'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Current order</dt>
            <dd>
              {rider.active_order_no ? (
                <button type="button" className="rider-order-chip" onClick={() => onOpenOrder(rider.active_order_no!)}>
                  Order #{rider.active_order_no} · {(rider.active_order_status ?? '').replaceAll('_', ' ').toLowerCase()}
                </button>
              ) : 'Not on an order'}
            </dd>
          </div>
        </dl>
        {rider.latitude != null && rider.longitude != null ? (
          <a className="maps-link" href={`https://www.google.com/maps?q=${rider.latitude},${rider.longitude}`} target="_blank" rel="noreferrer">
            <MapPin size={14} /> Open on Google Maps <ExternalLink size={12} />
          </a>
        ) : null}
        <p className="muted-line ow-subkicker">Dispatch only offers orders to riders whose location is under two minutes old.</p>
      </section>

      <section className="panel">
        <p className="section-kicker">Recent orders</p>
        {recent === null ? <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading…</p> : null}
        {recent && recent.length === 0 ? <p className="muted-line">No orders yet.</p> : null}
        <ul className="ow-summary-list">
          {(recent ?? []).map((order) => (
            <li key={order.order_no}>
              <span className="muted-line">#{order.order_no}</span>
              <button type="button" className="rider-recent" onClick={() => onOpenOrder(order.order_no)}>
                <strong>{order.customer_name ?? 'Customer'}</strong>
                <span className="muted-line">{formatTime(order.order_placed_on)} · {formatMoney(order.payment_amount)}</span>
              </button>
              <span className={`badge ${badgeTone(order.order_status)}`}>{order.order_status.replaceAll('_', ' ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function profilePayload(rider: AdminRiderListItem) {
  return {
    emailAddress: rider.email_address ?? '',
    firstName: rider.first_name ?? rider.display_name.split(' ')[0] ?? '',
    lastName: rider.last_name ?? '',
    mobileNo: rider.mobile_no ?? '',
    vehicleType: rider.vehicle_type ?? 'BIKE',
    defaultPayoutAmount: rider.default_payout_amount,
    serviceZoneCodes: rider.service_zone_codes,
  }
}

function RiderProfileForm({ token, rider, onSaved }: { token: string; rider: AdminRiderListItem; onSaved: () => void }) {
  const [draft, setDraft] = useState({ ...profilePayload(rider), password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const field = (key: keyof typeof draft) => ({
    value: draft[key] as string,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  })

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.password && draft.password.length < 12) {
      setError('A new password must be at least 12 characters.')
      return
    }
    const emailChanged = draft.emailAddress.trim().toLowerCase() !== (rider.email_address ?? '').toLowerCase()
    if (emailChanged && !window.confirm(`Change the sign-in email to ${draft.emailAddress.trim()}? Their current Google account will be unlinked.`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updateRider(token, rider.rider_uid, { ...draft, serviceZoneCodes: rider.service_zone_codes })
      setMessage(emailChanged ? 'Saved. They must now sign in with the new Google email.' : 'Saved.')
      setDraft((current) => ({ ...current, password: '' }))
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <p className="section-kicker">Profile</p>
      <div className="merchant-form-grid">
        <label>First name<input {...field('firstName')} required maxLength={80} /></label>
        <label>Last name<input {...field('lastName')} maxLength={80} /></label>
        <label>Google email<input {...field('emailAddress')} type="email" required maxLength={50} /></label>
        <label>Mobile<input {...field('mobileNo')} inputMode="tel" maxLength={12} /></label>
        <label>
          Vehicle
          <select {...field('vehicleType')}>
            {VEHICLES.map((vehicle) => <option key={vehicle.value} value={vehicle.value}>{vehicle.label}</option>)}
          </select>
        </label>
        <label>Payout per order (₹)<input {...field('defaultPayoutAmount')} type="number" min={0} step="0.01" required /></label>
        <label className="merchant-form-wide">
          New password (blank keeps the current one)
          <input {...field('password')} type="password" autoComplete="new-password" minLength={12} maxLength={128} />
        </label>
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}
      <div className="merchant-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />} Save profile
        </button>
      </div>
    </form>
  )
}

function RiderZonesForm({ token, rider, zones, onSaved }: { token: string; rider: AdminRiderListItem; zones: AdminServiceZone[]; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(rider.service_zone_codes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updateRider(token, rider.rider_uid, { ...profilePayload(rider), serviceZoneCodes: selected })
      setMessage(selected.length ? 'Delivery zones saved.' : 'Zones cleared: this rider gets no zone-matched orders.')
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save zones.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <p className="section-kicker">Delivery zones</p>
      <p className="muted-line">Orders are offered to riders in the order's zone first.</p>
      <div className="merchant-zone-list">
        {zones.map((zone) => (
          <label key={zone.code} className="merchant-zone-option">
            <input
              type="checkbox"
              checked={selected.includes(zone.code)}
              onChange={() =>
                setSelected((current) => (current.includes(zone.code) ? current.filter((code) => code !== zone.code) : [...current, zone.code]))
              }
            />
            <span>{zone.name}</span>
            {!zone.is_active ? <span className="badge is-neutral">inactive</span> : null}
          </label>
        ))}
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}
      <div className="merchant-form-actions">
        <button className="primary-button" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />} Save zones
        </button>
      </div>
    </section>
  )
}
