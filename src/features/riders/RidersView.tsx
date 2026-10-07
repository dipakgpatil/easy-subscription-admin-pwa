import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Bike, ChevronRight, LoaderCircle, MapPin, Plus, RefreshCw, Search } from 'lucide-react'

import { getRiders, listServiceZones, provisionRider } from '../../lib/api'
import { useLiveEvent } from '../../lib/liveEvents'
import type { AdminRiderListItem, AdminServiceZone } from '../../lib/types'
import RiderWorkspace from './RiderWorkspace'
import { locationIsFresh, riderBucket, seenAgo, vehicleLabel, VEHICLES, zoneName, type RiderFilter } from './riderUtils'

type Props = {
  token: string
  onOpenOrder: (orderNo: number) => void
}

const FILTERS: { key: RiderFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ONLINE', label: 'Online' },
  { key: 'BUSY', label: 'On delivery' },
  { key: 'OFFLINE', label: 'Offline' },
  { key: 'SUSPENDED', label: 'Suspended' },
]

const STATE_TONE: Record<Exclude<RiderFilter, 'ALL'>, string> = {
  ONLINE: 'is-positive',
  BUSY: 'is-info',
  OFFLINE: 'is-neutral',
  SUSPENDED: 'is-danger',
}

const FALLBACK_REFRESH_MS = 30_000

type Draft = {
  emailAddress: string
  firstName: string
  lastName: string
  mobileNo: string
  password: string
  vehicleType: string
  defaultPayoutAmount: string
  serviceZoneCodes: string[]
}

const EMPTY_DRAFT: Draft = {
  emailAddress: '',
  firstName: '',
  lastName: '',
  mobileNo: '',
  password: '',
  vehicleType: 'BIKE',
  defaultPayoutAmount: '20.00',
  serviceZoneCodes: [],
}

/** Riders: everyone at a glance with live state, then one rider's workspace. */
export default function RidersView({ token, onOpenOrder }: Props) {
  const [riders, setRiders] = useState<AdminRiderListItem[] | null>(null)
  const [zones, setZones] = useState<AdminServiceZone[]>([])
  const [filter, setFilter] = useState<RiderFilter>('ALL')
  const [query, setQuery] = useState('')
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const deferredQuery = useDeferredValue(query)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const list = await getRiders(token)
      setRiders(list.items)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load riders.')
    } finally {
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    void load()
    listServiceZones().then(setZones).catch(() => setZones([]))
  }, [load])

  // A rider changed (online, offline, moved, suspended): patch the row in place.
  useLiveEvent('rider', (event) => {
    setRiders((current) =>
      current?.map((rider) =>
        rider.rider_uid === event.rider_uid
          ? {
              ...rider,
              display_name: event.display_name ?? rider.display_name,
              status_cd: event.status_cd ?? rider.status_cd,
              availability_status: event.availability_status ?? rider.availability_status,
              latitude: event.latitude,
              longitude: event.longitude,
              location_updated_at: event.location_updated_at ?? rider.location_updated_at,
            }
          : rider,
      ) ?? current,
    )
  })

  // Order changes move riders' current orders: one quiet reload per burst.
  const orderReload = useRef<number | null>(null)
  useLiveEvent('order', () => {
    if (orderReload.current !== null) return
    orderReload.current = window.setTimeout(() => {
      orderReload.current = null
      void load()
    }, 1000)
  })
  useEffect(() => () => {
    if (orderReload.current !== null) window.clearTimeout(orderReload.current)
  }, [])

  // Fallback refresh, and keeps "seen 2 min ago" honest.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
      if (document.visibilityState === 'visible') void load()
    }, FALLBACK_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const counts = useMemo(() => {
    const result: Record<RiderFilter, number> = { ALL: 0, ONLINE: 0, BUSY: 0, OFFLINE: 0, SUSPENDED: 0 }
    for (const rider of riders ?? []) {
      result.ALL += 1
      result[riderBucket(rider)] += 1
    }
    return result
  }, [riders])

  const visible = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase()
    return (riders ?? [])
      .filter((rider) => filter === 'ALL' || riderBucket(rider) === filter)
      .filter(
        (rider) =>
          !term ||
          [rider.display_name, rider.email_address, rider.mobile_no, rider.vehicle_type, ...rider.service_zone_codes]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term),
      )
      .sort((a, b) => rank(riderBucket(a)) - rank(riderBucket(b)) || a.display_name.localeCompare(b.display_name))
  }, [deferredQuery, filter, riders])

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = draft.emailAddress.trim().toLowerCase()
    if (draft.password && draft.password.length < 12) {
      setError('A password must be at least 12 characters, or leave it blank.')
      return
    }
    // Creating upserts by email: an existing address would overwrite that rider.
    const existing = riders?.find((rider) => rider.email_address?.toLowerCase() === email)
    if (existing) {
      setError(`${existing.display_name} already uses ${email}. Open that rider instead.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rider = await provisionRider(token, { ...draft, emailAddress: email })
      setDraft(EMPTY_DRAFT)
      setCreating(false)
      await load()
      setSelectedUid(rider.rider_uid)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the rider.')
    } finally {
      setBusy(false)
    }
  }

  const selected = riders?.find((rider) => rider.rider_uid === selectedUid) ?? null
  if (selectedUid !== null && selected) {
    return (
      <RiderWorkspace
        token={token}
        rider={selected}
        zones={zones}
        onBack={() => setSelectedUid(null)}
        onChanged={() => void load()}
        onOpenOrder={onOpenOrder}
      />
    )
  }

  const field = (key: Exclude<keyof Draft, 'serviceZoneCodes'>) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  })

  return (
    <section className="riders-view">
      {error ? <p className="error-banner">{error}</p> : null}

      {creating ? (
        <form className="panel" onSubmit={create}>
          <div className="panel-head">
            <div>
              <p className="section-kicker">New rider</p>
              <h2>Add a rider</h2>
            </div>
          </div>
          <p className="muted-line">They sign in to Cravix Rider with this Google email, or with the password on iPhone.</p>
          <div className="merchant-form-grid">
            <label>First name<input {...field('firstName')} required maxLength={80} /></label>
            <label>Last name<input {...field('lastName')} maxLength={80} /></label>
            <label>Google email<input {...field('emailAddress')} type="email" required maxLength={50} placeholder="rider@gmail.com" /></label>
            <label>Mobile<input {...field('mobileNo')} inputMode="tel" maxLength={12} placeholder="9876543210" /></label>
            <label>
              Vehicle
              <select {...field('vehicleType')}>
                {VEHICLES.map((vehicle) => <option key={vehicle.value} value={vehicle.value}>{vehicle.label}</option>)}
              </select>
            </label>
            <label>Payout per order (₹)<input {...field('defaultPayoutAmount')} type="number" min={0} step="0.01" required /></label>
            <label className="merchant-form-wide">
              Password (optional, for iPhone sign-in)
              <input {...field('password')} type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="At least 12 characters" />
            </label>
            <fieldset className="merchant-form-wide rider-zone-picker">
              <legend>Delivery zones</legend>
              {zones.filter((zone) => zone.is_active).map((zone) => (
                <label key={zone.code} className="merchant-zone-option">
                  <input
                    type="checkbox"
                    checked={draft.serviceZoneCodes.includes(zone.code)}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        serviceZoneCodes: current.serviceZoneCodes.includes(zone.code)
                          ? current.serviceZoneCodes.filter((code) => code !== zone.code)
                          : [...current.serviceZoneCodes, zone.code],
                      }))
                    }
                  />
                  <span>{zone.name}</span>
                </label>
              ))}
            </fieldset>
            <div className="merchant-form-actions">
              <button className="ghost-button" type="button" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Plus size={16} />} Create and open
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <section className="panel">
        <div className="riders-toolbar">
          <nav className="ws-tabs" aria-label="Rider state">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={filter === key ? 'merchant-section-tab is-active' : 'merchant-section-tab'}
                onClick={() => setFilter(key)}
              >
                {key === 'ONLINE' ? <span className="live-dot" aria-hidden="true" /> : null}
                {label}
                <span className="merchant-count">{counts[key]}</span>
              </button>
            ))}
          </nav>
          <div className="merchant-list-tools">
            <label className="merchant-search">
              <Search size={16} aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or zone" />
            </label>
            <button className="ghost-button merchant-icon-button" type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh riders">
              <RefreshCw className={refreshing ? 'is-spinning' : undefined} size={17} />
            </button>
            {!creating ? (
              <button className="primary-button" type="button" onClick={() => setCreating(true)}>
                <Plus size={16} /> New rider
              </button>
            ) : null}
          </div>
        </div>

        <div className="merchant-list">
          {visible.map((rider) => {
            const bucket = riderBucket(rider)
            const fresh = locationIsFresh(rider.location_updated_at)
            return (
              <div key={rider.rider_uid} className="rider-row-wrap">
                <button type="button" className="merchant-row rider-row" onClick={() => setSelectedUid(rider.rider_uid)}>
                  <span className={`rider-avatar-dot is-${bucket.toLowerCase()}`} aria-hidden="true">
                    {rider.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="merchant-row-main">
                    <strong>{rider.display_name}</strong>
                    <span className="muted-line">
                      {rider.mobile_no ?? 'No phone'} · {vehicleLabel(rider.vehicle_type)}
                      {rider.service_zone_codes.length
                        ? ` · ${rider.service_zone_codes.map((code) => zoneName(zones, code)).join(', ')}`
                        : ' · No zone'}
                    </span>
                  </span>
                  <span className={`badge ${STATE_TONE[bucket]}`}>{FILTERS.find((item) => item.key === bucket)?.label}</span>
                  <span className={fresh ? 'rider-seen is-fresh' : 'rider-seen'}>
                    <MapPin size={13} aria-hidden="true" /> {rider.location_updated_at ? seenAgo(rider.location_updated_at) : 'No location'}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                {rider.active_order_no ? (
                  <button type="button" className="rider-order-chip" onClick={() => onOpenOrder(rider.active_order_no!)}>
                    <Bike size={13} /> On order #{rider.active_order_no}
                  </button>
                ) : null}
              </div>
            )
          })}
          {riders === null ? <p className="muted-line"><LoaderCircle className="is-spinning" size={15} /> Loading riders…</p> : null}
          {riders && visible.length === 0 ? <p className="muted-line">No riders match.</p> : null}
        </div>
      </section>
    </section>
  )
}

function rank(bucket: string): number {
  return ['BUSY', 'ONLINE', 'OFFLINE', 'SUSPENDED'].indexOf(bucket)
}
