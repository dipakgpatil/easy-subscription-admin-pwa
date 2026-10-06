import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, MapPin, Store, UtensilsCrossed, Map as MapIcon, Link2 } from 'lucide-react'

import { getMerchant, setMerchantCoverageZones } from '../../lib/api'
import type { AdminMerchantProfile, AdminServiceZone } from '../../lib/types'
import MenuPanel from './MenuPanel'
import ProfilePanel from './ProfilePanel'

type Section = 'menu' | 'profile' | 'zones'

type Props = {
  token: string
  merchantUid: number
  zones: AdminServiceZone[]
  onBack: () => void
}

const SECTIONS: { key: Section; label: string; icon: typeof Store }[] = [
  { key: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { key: 'profile', label: 'Profile & location', icon: MapPin },
  { key: 'zones', label: 'Delivery zones', icon: MapIcon },
]

/** One merchant: a header with its setup state, and focused sections for menu, profile and zones. */
export default function MerchantWorkspace({ token, merchantUid, zones, onBack }: Props) {
  const [merchant, setMerchant] = useState<AdminMerchantProfile | null>(null)
  const [section, setSection] = useState<Section>('menu')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setMerchant(await getMerchant(token, merchantUid))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load this merchant.')
    }
  }, [merchantUid, token])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    // A brand-new merchant needs a pickup location first; existing ones open on the menu.
    if (merchant && merchant.latitude == null && (merchant.active_product_count ?? 0) === 0) setSection('profile')
    // Only decide once per merchant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.merchant_uid])

  if (!merchant) {
    return (
      <section className="panel">
        <button className="ghost-button merchant-back" type="button" onClick={onBack}><ArrowLeft size={16} /> All merchants</button>
        {error ? <p className="error-banner">{error}</p> : <p className="muted-line"><LoaderCircle className="is-spinning" size={16} /> Loading…</p>}
      </section>
    )
  }

  const zoneNames = merchant.coverage_zone_codes.map((code) => zones.find((zone) => zone.code === code)?.name ?? code)

  return (
    <section className="merchant-workspace">
      <header className="panel merchant-header">
        <button className="ghost-button merchant-back" type="button" onClick={onBack}><ArrowLeft size={16} /> All merchants</button>
        <div className="merchant-header-main">
          <span className="merchant-row-icon" aria-hidden="true"><Store size={20} /></span>
          <div>
            <h2>{merchant.display_name}</h2>
            <p className="muted-line">
              {merchant.email_address ?? 'No email'}{merchant.mobile_no ? ` · ${merchant.mobile_no}` : ''}
            </p>
          </div>
        </div>
        <div className="merchant-header-badges">
          <span className={`badge ${merchant.status_cd === 'ACTIVE' ? 'is-positive' : 'is-warning'}`}>{merchant.status_cd}</span>
          <span className={`badge ${merchant.effective_availability_status === 'OPEN' ? 'is-positive' : 'is-neutral'}`}>
            Kitchen {merchant.effective_availability_status.toLowerCase()}
          </span>
          <span className={`badge ${zoneNames.length ? 'is-neutral' : 'is-warning'}`}>{zoneNames.join(', ') || 'No delivery zone'}</span>
          <span className={`badge ${merchant.latitude != null ? 'is-neutral' : 'is-warning'}`}>
            {merchant.latitude != null ? 'Pickup location set' : 'No pickup location'}
          </span>
          <span className={`badge ${merchant.google_linked ? 'is-positive' : 'is-neutral'}`}>
            <Link2 size={12} /> {merchant.google_linked ? 'Google linked' : 'Not signed in yet'}
          </span>
        </div>
        <nav className="merchant-sections" aria-label="Merchant sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={section === key ? 'merchant-section-tab is-active' : 'merchant-section-tab'}
              onClick={() => setSection(key)}
            >
              <Icon size={16} /> {label}
              {key === 'menu' ? <span className="merchant-count">{merchant.active_product_count ?? 0}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {section === 'menu' ? (
        <MenuPanel token={token} merchant={merchant} onChanged={() => void reload()} />
      ) : null}
      {section === 'profile' ? (
        <ProfilePanel token={token} merchant={merchant} onSaved={setMerchant} />
      ) : null}
      {section === 'zones' ? (
        <ZonesPanel token={token} merchant={merchant} zones={zones} onSaved={setMerchant} />
      ) : null}
    </section>
  )
}

function ZonesPanel({
  token,
  merchant,
  zones,
  onSaved,
}: {
  token: string
  merchant: AdminMerchantProfile
  zones: AdminServiceZone[]
  onSaved: (merchant: AdminMerchantProfile) => void
}) {
  const [selected, setSelected] = useState<string[]>(merchant.coverage_zone_codes)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const updated = await setMerchantCoverageZones(token, merchant.merchant_uid, selected)
      onSaved({ ...merchant, ...updated })
      setMessage(selected.length ? 'Delivery zones saved.' : 'Zones cleared. Customers can no longer see this merchant.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save zones.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Delivery zones</p>
          <h2>Where customers can order from {merchant.display_name}</h2>
        </div>
      </div>
      <p className="muted-line">A merchant is invisible to customers until it covers at least one zone.</p>
      <div className="merchant-zone-list">
        {zones.map((zone) => (
          <label key={zone.code} className="merchant-zone-option">
            <input
              type="checkbox"
              checked={selected.includes(zone.code)}
              onChange={() =>
                setSelected((current) =>
                  current.includes(zone.code) ? current.filter((code) => code !== zone.code) : [...current, zone.code],
                )
              }
            />
            <span>{zone.name}</span>
            {!zone.is_active ? <span className="badge is-neutral">inactive</span> : null}
          </label>
        ))}
      </div>
      {message ? <p className="success-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
      <div className="merchant-form-actions">
        <button className="primary-button" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? <LoaderCircle className="is-spinning" size={16} /> : null} Save zones
        </button>
      </div>
    </section>
  )
}
