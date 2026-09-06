import { useDeferredValue, useMemo, useState } from 'react'
import {
  Bike,
  CircleCheck,
  Link2,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  WalletCards,
} from 'lucide-react'
import { provisionRider, updateRiderStatus } from '../../lib/api'
import type { AdminRiderListItem, AdminRiderListResult, AdminServiceZone } from '../../lib/types'

type RiderDraft = {
  emailAddress: string
  firstName: string
  lastName: string
  mobileNo: string
  vehicleType: string
  defaultPayoutAmount: string
  serviceZoneCodes: string[]
}

const EMPTY_DRAFT: RiderDraft = {
  emailAddress: '',
  firstName: '',
  lastName: '',
  mobileNo: '',
  vehicleType: 'BIKE',
  defaultPayoutAmount: '20.00',
  serviceZoneCodes: [],
}

function displayDate(value: string | null): string {
  if (!value) return 'Location not reported'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatMoney(value: string): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
}

function matchesQuery(rider: AdminRiderListItem, query: string): boolean {
  const haystack = [
    rider.display_name,
    rider.email_address,
    rider.mobile_no,
    rider.vehicle_type,
    rider.status_cd,
    rider.availability_status,
    ...rider.service_zone_codes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

type RidersViewProps = {
  token: string
  riders: AdminRiderListResult | null
  serviceZones: AdminServiceZone[]
  onRefresh: () => Promise<void>
}

export default function RidersView({ token, riders, serviceZones, onRefresh }: RidersViewProps) {
  const [draft, setDraft] = useState<RiderDraft>(EMPTY_DRAFT)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingRiderUid, setUpdatingRiderUid] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const visibleRiders = useMemo(
    () => (riders?.items ?? []).filter((rider) => matchesQuery(rider, deferredQuery)),
    [deferredQuery, riders],
  )
  const activeCount = riders?.items.filter((rider) => rider.status_cd === 'ACTIVE').length ?? 0
  const awaitingGoogleCount = riders?.items.filter((rider) => !rider.google_linked).length ?? 0

  function toggleZone(zoneCode: string) {
    setDraft((current) => ({
      ...current,
      serviceZoneCodes: current.serviceZoneCodes.includes(zoneCode)
        ? current.serviceZoneCodes.filter((code) => code !== zoneCode)
        : [...current.serviceZoneCodes, zoneCode],
    }))
  }

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to refresh riders.')
    } finally {
      setRefreshing(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const rider = await provisionRider(token, draft)
      setDraft(EMPTY_DRAFT)
      setMessage(`${rider.display_name} is approved and can now sign in with ${rider.email_address}.`)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the rider account.')
    } finally {
      setSubmitting(false)
    }
  }

  async function changeStatus(rider: AdminRiderListItem) {
    const nextStatus = rider.status_cd === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    if (
      nextStatus === 'SUSPENDED' &&
      !window.confirm(`Suspend ${rider.display_name}? They will be signed out and removed from dispatch.`)
    ) {
      return
    }
    setUpdatingRiderUid(rider.rider_uid)
    setMessage(null)
    setError(null)
    try {
      await updateRiderStatus(token, rider.rider_uid, nextStatus)
      setMessage(`${rider.display_name} is now ${nextStatus === 'ACTIVE' ? 'active' : 'suspended'}.`)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update rider access.')
    } finally {
      setUpdatingRiderUid(null)
    }
  }

  return (
    <section className="rider-management-view">
      <section className="panel rider-onboarding-panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Onboarding</p>
            <h2>Create approved rider</h2>
          </div>
          <div className="rider-summary" aria-label="Rider account summary">
            <span><CircleCheck size={16} />{activeCount} active</span>
            <span><Link2 size={16} />{awaitingGoogleCount} awaiting Google</span>
          </div>
        </div>

        <form className="rider-onboarding-form" onSubmit={submit}>
          <div className="rider-form-grid">
            <label>
              Google email address
              <div className="input-with-icon">
                <Mail size={17} aria-hidden="true" />
                <input
                  type="email"
                  value={draft.emailAddress}
                  onChange={(event) => setDraft((current) => ({ ...current, emailAddress: event.target.value }))}
                  placeholder="rider@gmail.com"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </div>
            </label>
            <label>
              First name
              <input
                value={draft.firstName}
                onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
                placeholder="First name"
                autoComplete="given-name"
                maxLength={80}
                required
              />
            </label>
            <label>
              Last name
              <input
                value={draft.lastName}
                onChange={(event) => setDraft((current) => ({ ...current, lastName: event.target.value }))}
                placeholder="Last name"
                autoComplete="family-name"
                maxLength={80}
              />
            </label>
            <label>
              Mobile number
              <div className="input-with-icon">
                <Phone size={17} aria-hidden="true" />
                <input
                  value={draft.mobileNo}
                  onChange={(event) => setDraft((current) => ({ ...current, mobileNo: event.target.value }))}
                  inputMode="tel"
                  placeholder="9876543210"
                  autoComplete="tel"
                  maxLength={20}
                />
              </div>
            </label>
            <label>
              Vehicle
              <select
                value={draft.vehicleType}
                onChange={(event) => setDraft((current) => ({ ...current, vehicleType: event.target.value }))}
              >
                <option value="BIKE">Motorbike</option>
                <option value="EV_BIKE">Electric bike</option>
                <option value="SCOOTER">Scooter</option>
                <option value="CYCLE">Cycle</option>
              </select>
            </label>
            <label>
              Payout per order
              <div className="input-with-icon">
                <WalletCards size={17} aria-hidden="true" />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.defaultPayoutAmount}
                  onChange={(event) => setDraft((current) => ({ ...current, defaultPayoutAmount: event.target.value }))}
                  required
                />
              </div>
            </label>
          </div>

          <fieldset className="rider-zone-fieldset">
            <legend>Service zones</legend>
            <div className="rider-zone-options">
              {serviceZones.filter((zone) => zone.is_active).map((zone) => (
                <label key={zone.code} className="rider-zone-option">
                  <input
                    type="checkbox"
                    checked={draft.serviceZoneCodes.includes(zone.code)}
                    onChange={() => toggleZone(zone.code)}
                  />
                  <span>{zone.name}</span>
                </label>
              ))}
              {serviceZones.length === 0 ? <span className="muted-line">No service zones are available.</span> : null}
            </div>
          </fieldset>

          <div className="rider-form-actions">
            <button className="primary-button rider-command-button" type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="is-spinning" size={18} /> : <UserPlus size={18} />}
              {submitting ? 'Creating rider' : 'Approve and create'}
            </button>
          </div>
        </form>
        {message ? <p className="success-banner rider-feedback">{message}</p> : null}
        {error ? <p className="error-banner rider-feedback">{error}</p> : null}
      </section>

      <section className="panel rider-roster-panel">
        <div className="rider-roster-toolbar">
          <div>
            <p className="section-kicker">Current roster</p>
            <h2>{riders?.total ?? 0} rider{riders?.total === 1 ? '' : 's'}</h2>
          </div>
          <div className="rider-roster-tools">
            <label className="rider-search-field">
              <span className="sr-only">Search riders</span>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, phone or zone"
              />
            </label>
            <button
              className="ghost-button rider-icon-button"
              type="button"
              title="Refresh riders"
              aria-label="Refresh riders"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? 'is-spinning' : undefined} size={19} />
            </button>
          </div>
        </div>

        <div className="rider-roster-list">
          {visibleRiders.map((rider) => (
            <article key={rider.rider_uid} className="rider-roster-card">
              <div className="rider-identity">
                <div className="rider-avatar" aria-hidden="true">{rider.display_name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="rider-name-line">
                    <strong>{rider.display_name}</strong>
                    <span className={`badge ${rider.status_cd === 'ACTIVE' ? 'is-positive' : 'is-warning'}`}>
                      {rider.status_cd === 'ACTIVE' ? 'Approved' : 'Suspended'}
                    </span>
                    <span className={`badge ${rider.availability_status === 'ONLINE' ? 'is-positive' : 'is-neutral'}`}>
                      {rider.availability_status}
                    </span>
                  </div>
                  <div className="rider-contact-line">
                    <span><Mail size={15} />{rider.email_address ?? 'Email unavailable'}</span>
                    <span><Phone size={15} />{rider.mobile_no ?? 'Phone unavailable'}</span>
                    <span><Bike size={15} />{rider.vehicle_type ?? 'Vehicle unavailable'}</span>
                  </div>
                </div>
              </div>

              <div className="rider-operation-details">
                <span className={rider.google_linked ? 'rider-google-linked' : 'rider-google-pending'}>
                  <Link2 size={15} />{rider.google_linked ? 'Google linked' : 'Awaiting first sign-in'}
                </span>
                <span>{rider.active_order_no ? `Order #${rider.active_order_no}` : 'No active order'}</span>
                <span>{formatMoney(rider.pending_payout_amount)} pending</span>
              </div>

              <div className="rider-zone-row">
                {rider.service_zone_codes.length > 0
                  ? rider.service_zone_codes.map((code) => <span key={code}>{code.replaceAll('_', ' ')}</span>)
                  : <span>No zones assigned</span>}
              </div>

              <div className="rider-card-footer">
                {rider.latitude !== null && rider.longitude !== null ? (
                  <a
                    className="rider-location-link"
                    href={`https://maps.google.com/?q=${rider.latitude},${rider.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin size={16} />{displayDate(rider.location_updated_at)}
                  </a>
                ) : (
                  <span className="muted-line"><MapPin size={16} />{displayDate(null)}</span>
                )}
                <button
                  className={rider.status_cd === 'ACTIVE' ? 'ghost-button rider-command-button danger-button' : 'secondary-button rider-command-button'}
                  type="button"
                  onClick={() => void changeStatus(rider)}
                  disabled={updatingRiderUid === rider.rider_uid}
                >
                  {updatingRiderUid === rider.rider_uid ? (
                    <LoaderCircle className="is-spinning" size={18} />
                  ) : rider.status_cd === 'ACTIVE' ? (
                    <ShieldOff size={18} />
                  ) : (
                    <ShieldCheck size={18} />
                  )}
                  {updatingRiderUid === rider.rider_uid
                    ? 'Updating'
                    : rider.status_cd === 'ACTIVE'
                      ? 'Suspend'
                      : 'Activate'}
                </button>
              </div>
            </article>
          ))}
          {riders !== null && visibleRiders.length === 0 ? (
            <div className="rider-empty-state">
              <Search size={22} />
              <strong>No matching riders</strong>
              <span>Clear the search to see the full roster.</span>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  )
}
