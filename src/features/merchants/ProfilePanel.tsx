import { useState } from 'react'
import { ExternalLink, LoaderCircle, MapPin, Save } from 'lucide-react'

import { updateMerchant } from '../../lib/api'
import type { AdminMerchantProfile, MerchantUpdateInput } from '../../lib/types'
import { mapsUrl, parseCoordinates } from './merchantUtils'

type Props = {
  token: string
  merchant: AdminMerchantProfile
  onSaved: (merchant: AdminMerchantProfile) => void
}

type Draft = {
  displayName: string
  firstName: string
  lastName: string
  emailAddress: string
  mobileNo: string
  fssai: string
  kitchenType: 'IN_HOUSE' | 'VENDOR'
  prepMinutes: string
  locationLabel: string
  address: string
  location: string
  password: string
}

function draftFrom(merchant: AdminMerchantProfile): Draft {
  return {
    displayName: merchant.display_name,
    firstName: merchant.first_name ?? '',
    lastName: merchant.last_name ?? '',
    emailAddress: merchant.email_address ?? '',
    mobileNo: merchant.mobile_no ?? '',
    fssai: merchant.fssai_registration_no ?? '',
    kitchenType: merchant.kitchen_type === 'IN_HOUSE' ? 'IN_HOUSE' : 'VENDOR',
    prepMinutes: String(merchant.default_prep_minutes),
    locationLabel: merchant.location_label ?? '',
    address: merchant.address ?? '',
    location: merchant.latitude != null && merchant.longitude != null ? `${merchant.latitude}, ${merchant.longitude}` : '',
    password: '',
  }
}

export default function ProfilePanel({ token, merchant, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(merchant))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const coordinates = parseCoordinates(draft.location)

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  })

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.location.trim() && !coordinates) {
      setError('Paste a Google Maps link or "latitude, longitude" for the pickup location.')
      return
    }
    if (draft.password && draft.password.length < 12) {
      setError('A new password must be at least 12 characters.')
      return
    }
    const emailChanged = draft.emailAddress.trim().toLowerCase() !== (merchant.email_address ?? '').toLowerCase()
    if (
      emailChanged &&
      !window.confirm(`Change the sign-in email to ${draft.emailAddress.trim()}? The merchant's current Google account will be unlinked.`)
    ) {
      return
    }
    const payload: MerchantUpdateInput = {
      display_name: draft.displayName.trim(),
      first_name: draft.firstName.trim(),
      last_name: draft.lastName.trim() || null,
      mobile_no: draft.mobileNo.replace(/\s+/g, '') || null,
      kitchen_type: draft.kitchenType,
      default_prep_minutes: Number(draft.prepMinutes) || 15,
      location_label: draft.locationLabel.trim() || null,
      address: draft.address.trim() || null,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      ...(draft.fssai ? { fssai_registration_no: draft.fssai } : {}),
      ...(emailChanged ? { email_address: draft.emailAddress.trim().toLowerCase() } : {}),
      ...(draft.password ? { password: draft.password } : {}),
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateMerchant(token, merchant.merchant_uid, payload)
      onSaved(updated)
      setDraft(draftFrom(updated))
      setMessage(emailChanged ? 'Saved. The merchant must now sign in with the new Google email.' : 'Saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <div className="panel-head">
        <div>
          <p className="section-kicker">Pickup location</p>
          <h2>Where riders collect orders</h2>
        </div>
      </div>
      <div className="merchant-form-grid">
        <label className="merchant-form-wide">
          Pickup address
          <input {...field('address')} maxLength={255} placeholder="Shop 4, Destination Centre, Magarpatta City, Pune 411028" />
        </label>
        <label className="merchant-form-wide">
          Map location (paste a Google Maps link or "latitude, longitude")
          <input {...field('location')} placeholder="https://maps.google.com/?q=18.5155,73.9255" />
        </label>
        <p className="muted-line merchant-form-wide">
          <MapPin size={14} />{' '}
          {coordinates ? (
            <>
              {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)} ·{' '}
              <a href={mapsUrl(coordinates.latitude, coordinates.longitude)} target="_blank" rel="noreferrer">
                Check on Google Maps <ExternalLink size={12} />
              </a>
            </>
          ) : draft.location.trim() ? (
            'Could not read coordinates from that text.'
          ) : (
            'No pickup location yet: riders cannot be matched by distance or navigate here.'
          )}
        </p>
        <label>Short label<input {...field('locationLabel')} maxLength={120} placeholder="Destination Centre" /></label>
        <label>Default prep time (min)<input {...field('prepMinutes')} type="number" min={1} max={180} /></label>
      </div>

      <div className="panel-head merchant-subhead">
        <div>
          <p className="section-kicker">Profile</p>
          <h2>Kitchen and owner</h2>
        </div>
      </div>
      <div className="merchant-form-grid">
        <label>Kitchen name<input {...field('displayName')} required maxLength={160} /></label>
        <label>
          Kitchen type
          <select {...field('kitchenType')}>
            <option value="VENDOR">Vendor</option>
            <option value="IN_HOUSE">In-house</option>
          </select>
        </label>
        <label>FSSAI number<input {...field('fssai')} inputMode="numeric" maxLength={14} pattern="[0-9]{14}" /></label>
        <label>Owner first name<input {...field('firstName')} required maxLength={80} /></label>
        <label>Owner last name<input {...field('lastName')} maxLength={80} /></label>
        <label>Mobile<input {...field('mobileNo')} inputMode="tel" maxLength={12} /></label>
        <label>Google email (sign-in)<input {...field('emailAddress')} type="email" required maxLength={50} /></label>
        <label>
          New password (blank keeps current)
          <input {...field('password')} type="password" autoComplete="new-password" minLength={12} maxLength={128} />
        </label>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}
      <div className="merchant-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />} Save changes
        </button>
      </div>
    </form>
  )
}
