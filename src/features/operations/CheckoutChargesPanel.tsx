import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { LoaderCircle, ReceiptText, RotateCcw, Save, TriangleAlert } from 'lucide-react'

import { getCheckoutCharges, updateCheckoutCharges } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { AdminCheckoutCharges } from '../../lib/types'
import {
  computeBill,
  draftChanges,
  draftErrors,
  draftFromCharges,
  formatRate,
  rupees,
  settingsFromDraft,
  toHundredths,
  type ChargesDraft,
  type ChargesField,
  type PreviewBillLine,
} from './checkoutCharges'

const FORM_ID = 'checkout-charges-form'

type Example = {
  itemsTotal: string
  restaurants: string
  zoneCode: string
  coupon: string
}

const DEFAULT_EXAMPLE: Example = { itemsTotal: '250', restaurants: '1', zoneCode: '', coupon: '' }

/** One row of the example bill, worded and signed as the customer app shows it. */
function billLine(line: PreviewBillLine, deliveryUnset: boolean) {
  const amount =
    line.code === 'DELIVERY' && deliveryUnset
      ? 'Standard'
      : line.code === 'DELIVERY' && line.amount === 0
        ? 'Free'
        : line.amount < 0
          ? `−${rupees(-line.amount)}`
          : rupees(line.amount)
  return (
    <li key={`${line.code}-${line.label}`} className={line.code === 'DISCOUNT' ? 'is-discount' : undefined}>
      <span>
        {line.label}
        {line.note ? <small>{line.note}</small> : null}
      </span>
      <span className="charges-amount">{amount}</span>
    </li>
  )
}

type AmountFieldProps = {
  label: string
  hint: string
  unit: '₹' | '%'
  value: string
  error: string | undefined
  onChange: (value: string) => void
}

/** A labelled amount input with its unit, hint and validation message. */
function AmountField({ label, hint, unit, value, error, onChange }: AmountFieldProps) {
  const id = useId()
  return (
    <div className="charges-field">
      <label htmlFor={id}>{label}</label>
      <div className={`charges-input${unit === '%' ? ' is-rate' : ''}${error ? ' is-invalid' : ''}`}>
        {unit === '₹' ? <span aria-hidden="true">₹</span> : null}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit === '%' ? <span aria-hidden="true">%</span> : null}
      </div>
      <p id={`${id}-hint`} className={error ? 'charges-hint is-error' : 'charges-hint'}>{error ?? hint}</p>
    </div>
  )
}

/**
 * Platform fee, packaging, delivery fee per zone and GST: what every customer bill adds
 * on top of the items. The backend computes real bills; the example here only previews
 * the draft with the same rules so an admin sees the effect before saving.
 */
export default function CheckoutChargesPanel({ token }: { token: string }) {
  const [charges, setCharges] = useState<AdminCheckoutCharges | null>(null)
  const [draft, setDraft] = useState<ChargesDraft | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [example, setExample] = useState<Example>(DEFAULT_EXAMPLE)
  const zoneIdPrefix = useId()

  const load = useCallback(async () => {
    try {
      const next = await getCheckoutCharges(token)
      setCharges(next)
      setDraft(draftFromCharges(next))
      setLoadError(null)
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Unable to load checkout charges.')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const errors = useMemo(() => (charges && draft ? draftErrors(charges, draft) : {}), [charges, draft])
  const hasErrors = Object.keys(errors).length > 0
  const pending = useMemo(
    () => (charges && draft && !hasErrors ? draftChanges(charges, draft) : null),
    [charges, draft, hasErrors],
  )
  const dirty = useMemo(() => {
    if (!charges || !draft) return false
    if (pending) return pending.changes.length > 0
    // With an invalid field the draft cannot be diffed field by field, but it has changed.
    return JSON.stringify(draft) !== JSON.stringify(draftFromCharges(charges))
  }, [charges, draft, pending])

  function update(change: Partial<ChargesDraft>) {
    setDraft((current) => (current ? { ...current, ...change } : current))
    setMessage(null)
  }

  function updateField(field: ChargesField) {
    return (value: string) => update({ [field]: value })
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!charges || !draft || saving) return
    if (hasErrors || !pending) {
      setError('Fix the highlighted fields first.')
      return
    }
    if (pending.changes.length === 0) return
    const gstTurningOn = pending.payload.gst_enabled === true
    const warning = gstTurningOn
      ? 'GST will be added to every customer bill. Only continue if Cravix has a GSTIN.\n\n'
      : ''
    const summary = pending.changes.map((line) => `• ${line}`).join('\n')
    if (
      !window.confirm(
        `${warning}Save these checkout charges?\n\n${summary}\n\nCarts show them on their next refresh. Orders already placed keep their bill.`,
      )
    ) {
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await updateCheckoutCharges(token, pending.payload)
      setCharges(next)
      setDraft(draftFromCharges(next))
      setMessage('Checkout charges saved. New bills use them now.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save checkout charges.')
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!charges) return
    setDraft(draftFromCharges(charges))
    setError(null)
    setMessage(null)
  }

  const zones = charges?.zones ?? []
  const hasFee = (code: string) => Boolean(draft?.zoneFees[code]?.trim())
  // The example starts on a live zone that charges a fee, since that is what most bills show.
  const exampleZone =
    zones.find((zone) => zone.code === example.zoneCode) ??
    zones.find((zone) => zone.is_active && hasFee(zone.code)) ??
    zones.find((zone) => hasFee(zone.code)) ??
    zones.find((zone) => zone.is_active) ??
    zones[0] ??
    null
  const settings = draft ? settingsFromDraft(draft, exampleZone?.code ?? null) : null
  const exampleItems = toHundredths(example.itemsTotal)
  const exampleCoupon = example.coupon.trim() ? toHundredths(example.coupon) : 0
  const bill = settings
    ? computeBill(settings, {
        itemsTotal: exampleItems ?? 0,
        restaurants: Number(example.restaurants) || 1,
        couponDiscount: exampleCoupon ?? 0,
        couponCode: 'EXAMPLE',
      })
    : null
  const gstLine =
    settings && bill && settings.gstEnabled
      ? `GST: ${rupees(bill.foodGst)} on food (${formatRate(settings.foodGstRate)}% of ${rupees(bill.itemsTotal + bill.packagingFee)}) and ${rupees(bill.feesGst)} on fees (${formatRate(settings.feesGstRate)}% of ${rupees(bill.deliveryFee + bill.platformFee)}).`
      : 'GST is off, so no tax is added.'
  const savedGst = charges?.gst_enabled ?? false
  const gstTurningOn = Boolean(draft?.gstEnabled && !savedGst)

  return (
    <section className="panel charges-panel">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Customer bill</p>
          <h2>Checkout charges</h2>
        </div>
        {charges ? (
          <span className={`badge ${charges.gst_enabled ? 'is-warning' : 'is-neutral'}`}>
            {charges.gst_enabled ? 'GST on' : 'GST off'}
          </span>
        ) : null}
      </div>
      <p className="muted-line">
        Added to every customer bill on top of the items. Carts pick up a change on their next refresh;
        orders already placed keep the bill they were charged.
      </p>

      {loadError ? (
        <div className="charges-load-error">
          <p className="error-banner">{loadError}</p>
          <button className="ghost-button" type="button" onClick={() => void load()}>
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      ) : null}
      {!loadError && (!charges || !draft) ? (
        <p className="muted-line"><LoaderCircle className="is-spinning" size={14} /> Loading checkout charges…</p>
      ) : null}

      {charges && draft ? (
        <>
          <div className="charges-layout">
            <form id={FORM_ID} className="charges-form" onSubmit={save} noValidate>
              <fieldset className="charges-fieldset" disabled={saving}>
                <div className="charges-group">
                  <h3 className="charges-group-title">Fees</h3>
                  <div className="charges-fields">
                    <AmountField
                      label="Platform fee"
                      hint="Once per order. ₹0 leaves it off the bill."
                      unit="₹"
                      value={draft.platformFee}
                      error={errors.platformFee}
                      onChange={updateField('platformFee')}
                    />
                    <AmountField
                      label="Default packaging charge"
                      hint="Per restaurant in the order, unless the restaurant has its own (Merchants → Profile)."
                      unit="₹"
                      value={draft.packagingFee}
                      error={errors.packagingFee}
                      onChange={updateField('packagingFee')}
                    />
                  </div>
                </div>

                <div className="charges-group">
                  <h3 className="charges-group-title">Delivery fee by zone</h3>
                  <p className="charges-hint">Once per order, by the zone of the delivery address. ₹0 shows as Free.</p>
                  <ul className="charges-zone-list">
                    {zones.map((zone, index) => {
                      const zoneError = errors[`zone:${zone.code}`]
                      const unset = zone.delivery_fee === null && !hasFee(zone.code)
                      const inputId = `${zoneIdPrefix}-${index}`
                      return (
                        <li key={zone.code} className="charges-zone-row">
                          <label htmlFor={inputId} className="charges-zone-name">
                            <strong>{zone.name}</strong>
                            <span>{zone.code}</span>
                            {!zone.is_active ? <span className="badge is-neutral">Zone inactive</span> : null}
                          </label>
                          <div className={`charges-input${zoneError ? ' is-invalid' : ''}`}>
                            <span aria-hidden="true">₹</span>
                            <input
                              id={inputId}
                              inputMode="decimal"
                              autoComplete="off"
                              value={draft.zoneFees[zone.code] ?? ''}
                              placeholder={zone.delivery_fee === null ? 'Not set' : undefined}
                              aria-invalid={zoneError ? true : undefined}
                              onChange={(event) =>
                                update({ zoneFees: { ...draft.zoneFees, [zone.code]: event.target.value } })
                              }
                            />
                          </div>
                          {zoneError ? <p className="charges-hint is-error charges-zone-note">{zoneError}</p> : null}
                          {!zoneError && unset ? (
                            <p className="charges-hint charges-zone-note">No fee set: the standard delivery charge applies.</p>
                          ) : null}
                        </li>
                      )
                    })}
                    {zones.length === 0 ? <li className="muted-line">No service zones are configured.</li> : null}
                  </ul>
                </div>

                <div className="charges-group">
                  <div className="charges-gst-head">
                    <h3 className="charges-group-title">GST</h3>
                    <button
                      className={`charges-switch${draft.gstEnabled ? ' is-on' : ''}`}
                      type="button"
                      role="switch"
                      aria-checked={draft.gstEnabled}
                      onClick={() => update({ gstEnabled: !draft.gstEnabled })}
                    >
                      <span className="charges-switch-track" aria-hidden="true"><span /></span>
                      {draft.gstEnabled ? 'Charge GST' : 'No GST'}
                    </button>
                  </div>
                  <div className={`charges-callout${gstTurningOn ? ' is-danger' : ''}`} role="note">
                    <TriangleAlert size={18} />
                    <p>
                      <strong>Switch GST on only once Cravix has a GSTIN.</strong>{' '}
                      {gstTurningOn
                        ? 'After you save, every customer bill includes GST. Check with your CA that the registration is active and the rates are right.'
                        : 'Charging GST without a GST registration is not allowed. Ask your CA before turning this on and to confirm the rates.'}
                    </p>
                  </div>
                  <div className="charges-fields">
                    <AmountField
                      label="GST on food"
                      hint="Percent of item total plus packaging."
                      unit="%"
                      value={draft.foodGstRate}
                      error={errors.foodGstRate}
                      onChange={updateField('foodGstRate')}
                    />
                    <AmountField
                      label="GST on fees"
                      hint="Percent of delivery and platform fees."
                      unit="%"
                      value={draft.feesGstRate}
                      error={errors.feesGstRate}
                      onChange={updateField('feesGstRate')}
                    />
                  </div>
                </div>
              </fieldset>
            </form>

            <aside className="charges-preview" aria-label="Example bill">
              <div className="charges-preview-head">
                <ReceiptText size={18} />
                <div>
                  <p className="section-kicker">Live example</p>
                  <h3 className="charges-group-title">What the customer pays</h3>
                </div>
              </div>
              <div className="charges-example">
                <label>
                  Item total (₹)
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={example.itemsTotal}
                    aria-invalid={exampleItems === null ? true : undefined}
                    onChange={(event) => setExample((current) => ({ ...current, itemsTotal: event.target.value }))}
                  />
                </label>
                <label>
                  Restaurants
                  <select
                    value={example.restaurants}
                    onChange={(event) => setExample((current) => ({ ...current, restaurants: event.target.value }))}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </label>
                <label>
                  Zone
                  <select
                    value={exampleZone?.code ?? ''}
                    onChange={(event) => setExample((current) => ({ ...current, zoneCode: event.target.value }))}
                    disabled={zones.length === 0}
                  >
                    {zones.map((zone) => (
                      <option key={zone.code} value={zone.code}>
                        {zone.name}
                        {hasFee(zone.code) ? '' : ' (no fee set)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Coupon (₹, optional)
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={example.coupon}
                    placeholder="0"
                    aria-invalid={exampleCoupon === null ? true : undefined}
                    onChange={(event) => setExample((current) => ({ ...current, coupon: event.target.value }))}
                  />
                </label>
              </div>

              {bill ? (
                <>
                  <ul className="charges-bill">
                    {bill.lines.filter((line) => line.code !== 'DISCOUNT').map((line) => billLine(line, bill.deliveryUnset))}
                    <li className="is-subtotal">
                      <span>Grand total</span>
                      <span className="charges-amount">{rupees(bill.grandTotal)}</span>
                    </li>
                    {bill.lines.filter((line) => line.code === 'DISCOUNT').map((line) => billLine(line, bill.deliveryUnset))}
                  </ul>
                  <div className="charges-total">
                    <span>{bill.deliveryUnset
                      ? settings?.gstEnabled
                        ? 'To pay, plus the standard delivery charge and its GST'
                        : 'To pay, plus the standard delivery charge'
                      : 'To pay'}</span>
                    <strong className="charges-amount">{rupees(bill.totalAmount)}</strong>
                  </div>
                  <p className="charges-hint">
                    {gstLine} Coupons come off after taxes. Lines at ₹0 stay off the bill, and a ₹0 delivery fee
                    shows as Free. Restaurants with their own packaging charge use it instead of the default.
                  </p>
                </>
              ) : (
                <p className="charges-hint is-error">Fix the highlighted fields to update the example.</p>
              )}
            </aside>
          </div>

          <div className="charges-actions">
            {error ? <p className="error-banner">{error}</p> : null}
            {message ? <p className="success-banner">{message}</p> : null}
            <p className="muted-line">
              {charges.updated_at
                ? `Last changed ${formatDateTime(charges.updated_at)}${charges.updated_by ? ` by ${charges.updated_by}` : ''}`
                : 'Default charges, never changed'}
            </p>
            <div className="operations-actions">
              <button className="ghost-button" type="button" onClick={discard} disabled={saving || !dirty}>
                <RotateCcw size={16} /> Discard changes
              </button>
              <button className="primary-button" type="submit" form={FORM_ID} disabled={saving || !dirty || hasErrors}>
                {saving ? <LoaderCircle className="is-spinning" size={16} /> : <Save size={16} />}
                {saving ? 'Saving…' : 'Save charges'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
