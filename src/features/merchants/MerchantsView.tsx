import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ChevronRight, LoaderCircle, MapPin, Plus, RefreshCw, Search, Store, TriangleAlert } from 'lucide-react'

import { getProvisionedMerchants, listServiceZones, provisionMerchant } from '../../lib/api'
import type { AdminMerchantProfile, AdminServiceZone } from '../../lib/types'
import MerchantWorkspace from './MerchantWorkspace'

type Props = { token: string }

type NewMerchantDraft = {
  displayName: string
  firstName: string
  lastName: string
  emailAddress: string
  mobileNo: string
  fssaiRegistrationNo: string
  kitchenType: 'IN_HOUSE' | 'VENDOR'
  password: string
}

const EMPTY_DRAFT: NewMerchantDraft = {
  displayName: '',
  firstName: '',
  lastName: '',
  emailAddress: '',
  mobileNo: '',
  fssaiRegistrationNo: '',
  kitchenType: 'VENDOR',
  password: '',
}

function setupGaps(merchant: AdminMerchantProfile): string[] {
  const gaps: string[] = []
  if (merchant.coverage_zone_codes.length === 0) gaps.push('No delivery zone')
  if ((merchant.active_product_count ?? 0) === 0) gaps.push('Empty menu')
  if (merchant.latitude == null) gaps.push('No pickup location')
  return gaps
}

/** Merchant list → one merchant's workspace. Creating a merchant opens its workspace. */
export default function MerchantsView({ token }: Props) {
  const [merchants, setMerchants] = useState<AdminMerchantProfile[] | null>(null)
  const [zones, setZones] = useState<AdminServiceZone[]>([])
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<NewMerchantDraft>(EMPTY_DRAFT)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [list, zoneList] = await Promise.all([getProvisionedMerchants(token), listServiceZones()])
      setMerchants(list)
      setZones(zoneList)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load merchants.')
    } finally {
      setBusy(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase()
    return (merchants ?? []).filter((merchant) =>
      !term ||
      [merchant.display_name, merchant.email_address, merchant.mobile_no, merchant.location_label, ...merchant.coverage_zone_codes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [deferredQuery, merchants])

  async function createMerchant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{14}$/.test(draft.fssaiRegistrationNo)) {
      setError('FSSAI number must be 14 digits.')
      return
    }
    if (draft.password && draft.password.length < 12) {
      setError('Password must be at least 12 characters, or leave it blank.')
      return
    }
    // Provisioning upserts by email, so an existing address would silently
    // overwrite that merchant's profile instead of creating a new one.
    const email = draft.emailAddress.trim().toLowerCase()
    const existing = merchants?.find((merchant) => merchant.email_address?.toLowerCase() === email)
    if (existing) {
      setError(`${existing.display_name} already uses ${email}. Open that merchant instead, or use a different email.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const merchant = await provisionMerchant(token, {
        emailAddress: draft.emailAddress.trim().toLowerCase(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        mobileNo: draft.mobileNo.trim(),
        password: draft.password,
        displayName: draft.displayName.trim(),
        fssaiRegistrationNo: draft.fssaiRegistrationNo,
        pickupGroupCode: '',
        kitchenType: draft.kitchenType,
        locationLabel: '',
        defaultPrepMinutes: 15,
      })
      setDraft(EMPTY_DRAFT)
      setCreating(false)
      await load()
      setSelectedUid(merchant.merchant_uid)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the merchant.')
    } finally {
      setBusy(false)
    }
  }

  if (selectedUid !== null) {
    return (
      <MerchantWorkspace
        token={token}
        merchantUid={selectedUid}
        zones={zones}
        onBack={() => {
          setSelectedUid(null)
          void load()
        }}
      />
    )
  }

  const field = (key: keyof NewMerchantDraft) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  })

  return (
    <section className="merchants-view">
      {error ? <p className="error-banner">{error}</p> : null}

      {creating ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">New merchant</p>
              <h2>Create a merchant</h2>
            </div>
          </div>
          <p className="muted-line">
            Next you'll set the pickup location, delivery zones and menu in the merchant's workspace.
          </p>
          <form className="merchant-form-grid" onSubmit={createMerchant}>
            <label>Kitchen name<input {...field('displayName')} required maxLength={160} placeholder="Misal Junction" /></label>
            <label>Owner first name<input {...field('firstName')} required maxLength={80} /></label>
            <label>Owner last name<input {...field('lastName')} maxLength={80} /></label>
            <label>Google email (sign-in)<input {...field('emailAddress')} type="email" required maxLength={50} placeholder="owner@gmail.com" /></label>
            <label>Mobile<input {...field('mobileNo')} inputMode="tel" maxLength={12} placeholder="9876543210" /></label>
            <label>FSSAI number<input {...field('fssaiRegistrationNo')} inputMode="numeric" required maxLength={14} placeholder="14 digits" /></label>
            <label>
              Kitchen type
              <select {...field('kitchenType')}>
                <option value="VENDOR">Vendor</option>
                <option value="IN_HOUSE">In-house</option>
              </select>
            </label>
            <label>
              Password (needed for iPhone sign-in)
              <input {...field('password')} type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="At least 12 characters" />
            </label>
            <div className="merchant-form-actions">
              <button className="ghost-button" type="button" onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Plus size={16} />} Create and open
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <div className="merchant-list-toolbar">
          <div>
            <p className="section-kicker">Merchants</p>
            <h2>{merchants ? `${merchants.length} merchant${merchants.length === 1 ? '' : 's'}` : 'Merchants'}</h2>
          </div>
          <div className="merchant-list-tools">
            <label className="merchant-search">
              <Search size={16} aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or zone" />
            </label>
            <button className="ghost-button merchant-icon-button" type="button" onClick={() => void load()} disabled={busy} aria-label="Refresh">
              <RefreshCw className={busy ? 'is-spinning' : undefined} size={17} />
            </button>
            {!creating ? (
              <button className="primary-button" type="button" onClick={() => setCreating(true)}>
                <Plus size={16} /> New merchant
              </button>
            ) : null}
          </div>
        </div>

        <div className="merchant-list">
          {visible.map((merchant) => {
            const gaps = setupGaps(merchant)
            return (
              <button key={merchant.merchant_uid} type="button" className="merchant-row" onClick={() => setSelectedUid(merchant.merchant_uid)}>
                <span className="merchant-row-icon" aria-hidden="true"><Store size={18} /></span>
                <span className="merchant-row-main">
                  <strong>{merchant.display_name}</strong>
                  <span className="muted-line">
                    {merchant.coverage_zone_codes.map((code) => zones.find((zone) => zone.code === code)?.name ?? code).join(', ') || 'No zone'}
                    {' · '}
                    {merchant.active_product_count ?? 0} on menu
                    {merchant.location_label ? ` · ${merchant.location_label}` : ''}
                  </span>
                  {gaps.length ? (
                    <span className="merchant-row-gaps"><TriangleAlert size={13} /> {gaps.join(' · ')}</span>
                  ) : null}
                </span>
                <span className={`badge ${merchant.status_cd === 'ACTIVE' ? 'is-positive' : 'is-warning'}`}>{merchant.status_cd}</span>
                {merchant.latitude != null ? <MapPin size={15} aria-label="Pickup location set" /> : null}
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )
          })}
          {merchants && visible.length === 0 ? <p className="muted-line">No merchants match.</p> : null}
        </div>
      </section>
    </section>
  )
}
