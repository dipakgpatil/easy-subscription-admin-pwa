/**
 * Checkout charges form and the customer bill, recomputed in the browser for the preview.
 * The bill mirrors the backend's `app/services/pricing.py`, which stays the only source of
 * real totals. Everything is in hundredths (paise, or hundredths of a percent) so the
 * half-up rounding matches the backend's Decimal arithmetic exactly.
 */

import type { AdminCheckoutCharges, CheckoutChargesInput } from '../../lib/types'

export type BillLineCode = 'ITEMS' | 'PACKAGING' | 'DELIVERY' | 'PLATFORM_FEE' | 'GST' | 'DISCOUNT'

export type PreviewBillLine = {
  code: BillLineCode
  label: string
  /** Paise; negative for a discount. */
  amount: number
  note: string | null
}

export type ChargeSettings = {
  /** Paise per order. */
  platformFee: number
  /** Paise per restaurant in the order. */
  packagingFee: number
  /**
   * Paise for the delivery zone; null when the zone has no fee of its own, so checkout
   * uses the standard DELIVERY charge, which this preview does not know.
   */
  deliveryFee: number | null
  gstEnabled: boolean
  /** Hundredths of a percent: 500 is 5%. */
  foodGstRate: number
  feesGstRate: number
}

export type ExampleOrder = {
  /** Paise, after item-level discounts. */
  itemsTotal: number
  restaurants: number
  /** Paise of coupon discount, applied after taxes. */
  couponDiscount: number
  couponCode: string
}

export type PreviewBill = {
  itemsTotal: number
  packagingFee: number
  deliveryFee: number
  platformFee: number
  foodGst: number
  feesGst: number
  taxesAmount: number
  grandTotal: number
  discount: number
  totalAmount: number
  /** The zone has no fee, so the totals leave out the standard delivery charge. */
  deliveryUnset: boolean
  lines: PreviewBillLine[]
}

export const MAX_FEE = 50000
export const MAX_RATE = 2800

/** "5", "5.5" or "5.50" as hundredths; null for anything else (signs, 3+ decimals, text). */
export function toHundredths(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(text.trim())
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Hundredths back to the API's decimal string: 550 -> "5.50". */
export function fromHundredths(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })

/** Paise as the admin's money format: 25050 -> "₹250.50". */
export function rupees(paise: number): string {
  return INR.format(paise / 100)
}

/** A rate for copy: 500 -> "5", 250 -> "2.5". */
export function formatRate(rate: number): string {
  return fromHundredths(rate).replace(/\.?0+$/, '')
}

/** rate% of an amount in paise, rounded to the paisa half-up. */
export function percentOf(amount: number, rate: number): number {
  return Math.floor((amount * rate + 5000) / 10000)
}

/** As the customer bill words it: only the parts that actually carry GST. */
export function gstNote(foodRate: number, feesRate: number, foodGst = 1, feesGst = 1): string {
  return [
    foodGst > 0 ? `${formatRate(foodRate)}% on food` : null,
    feesGst > 0 ? `${formatRate(feesRate)}% on delivery and platform fees` : null,
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * Spec order: items, packaging per restaurant, delivery, platform fee, GST on food
 * (items + packaging) and on fees (delivery + platform), then coupons off the grand total.
 * Zero lines are left out as on the customer bill, except Delivery fee, which shows as free.
 */
export function computeBill(settings: ChargeSettings, order: ExampleOrder): PreviewBill {
  const itemsTotal = order.itemsTotal
  const packagingFee = settings.packagingFee * Math.max(order.restaurants, 0)
  const deliveryFee = settings.deliveryFee ?? 0
  const platformFee = settings.platformFee
  const foodGst = settings.gstEnabled ? percentOf(itemsTotal + packagingFee, settings.foodGstRate) : 0
  const feesGst = settings.gstEnabled ? percentOf(deliveryFee + platformFee, settings.feesGstRate) : 0
  const taxesAmount = foodGst + feesGst
  const grandTotal = itemsTotal + packagingFee + deliveryFee + platformFee + taxesAmount
  const discount = Math.min(Math.max(order.couponDiscount, 0), grandTotal)

  const lines: PreviewBillLine[] = [{ code: 'ITEMS', label: 'Item total', amount: itemsTotal, note: null }]
  if (packagingFee > 0) {
    lines.push({ code: 'PACKAGING', label: 'Packaging charges', amount: packagingFee, note: 'Charged by the restaurant' })
  }
  lines.push({
    code: 'DELIVERY',
    label: 'Delivery fee',
    amount: deliveryFee,
    note: settings.deliveryFee === null ? 'No zone fee set; the standard delivery charge applies' : null,
  })
  if (platformFee > 0) {
    lines.push({ code: 'PLATFORM_FEE', label: 'Platform fee', amount: platformFee, note: 'Helps us run Cravix' })
  }
  if (taxesAmount > 0) {
    lines.push({
      code: 'GST',
      label: 'GST and taxes',
      amount: taxesAmount,
      note: gstNote(settings.foodGstRate, settings.feesGstRate, foodGst, feesGst),
    })
  }
  if (discount > 0) {
    lines.push({ code: 'DISCOUNT', label: `Coupon (${order.couponCode})`, amount: -discount, note: null })
  }

  return {
    itemsTotal,
    packagingFee,
    deliveryFee,
    platformFee,
    foodGst,
    feesGst,
    taxesAmount,
    grandTotal,
    discount,
    totalAmount: grandTotal - discount,
    deliveryUnset: settings.deliveryFee === null,
    lines,
  }
}

export type ChargesDraft = {
  platformFee: string
  packagingFee: string
  gstEnabled: boolean
  foodGstRate: string
  feesGstRate: string
  /** Delivery fee text by zone code; blank for a zone that has no fee yet. */
  zoneFees: Record<string, string>
}

export type ChargesField = 'platformFee' | 'packagingFee' | 'foodGstRate' | 'feesGstRate'

export function draftFromCharges(charges: AdminCheckoutCharges): ChargesDraft {
  return {
    platformFee: charges.platform_fee,
    packagingFee: charges.default_packaging_fee,
    gstEnabled: charges.gst_enabled,
    foodGstRate: charges.food_gst_rate,
    feesGstRate: charges.fees_gst_rate,
    zoneFees: Object.fromEntries(charges.zones.map((zone) => [zone.code, zone.delivery_fee ?? ''])),
  }
}

/** The same limits the API enforces: fees ₹0–500, rates 0–28%. */
export function feeError(text: string): string | null {
  const value = toHundredths(text)
  if (value === null) return 'Enter an amount like 5 or 12.50.'
  return value > MAX_FEE ? 'At most ₹500.' : null
}

export function rateError(text: string): string | null {
  const value = toHundredths(text)
  if (value === null) return 'Enter a percentage like 5 or 2.5.'
  return value > MAX_RATE ? 'At most 28%.' : null
}

/**
 * A zone's fee may stay blank only while it has none saved: the API sets fees but cannot
 * clear one, and ₹0 is how delivery is made free.
 */
export function zoneFeeError(text: string, saved: string | null): string | null {
  if (text.trim()) return feeError(text)
  return saved === null ? null : 'Enter a fee; ₹0 makes delivery free.'
}

/** Field errors keyed by field name, or `zone:<CODE>` for a delivery fee. */
export function draftErrors(charges: AdminCheckoutCharges, draft: ChargesDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  const checks: [string, string | null][] = [
    ['platformFee', feeError(draft.platformFee)],
    ['packagingFee', feeError(draft.packagingFee)],
    ['foodGstRate', rateError(draft.foodGstRate)],
    ['feesGstRate', rateError(draft.feesGstRate)],
    ...charges.zones.map((zone): [string, string | null] => [
      `zone:${zone.code}`,
      zoneFeeError(draft.zoneFees[zone.code] ?? '', zone.delivery_fee),
    ]),
  ]
  for (const [key, error] of checks) if (error) errors[key] = error
  return errors
}

/**
 * Only what changed, as the PUT body, plus one readable line per change for the
 * confirmation. Assumes the draft has no errors.
 */
export function draftChanges(
  charges: AdminCheckoutCharges,
  draft: ChargesDraft,
): { payload: CheckoutChargesInput; changes: string[] } {
  const payload: CheckoutChargesInput = {}
  const changes: string[] = []
  const money = (text: string) => rupees(toHundredths(text) ?? 0)
  const rate = (text: string) => `${formatRate(toHundredths(text) ?? 0)}%`
  const differs = (saved: string, next: string) => toHundredths(saved) !== toHundredths(next)

  if (differs(charges.platform_fee, draft.platformFee)) {
    payload.platform_fee = fromHundredths(toHundredths(draft.platformFee) ?? 0)
    changes.push(`Platform fee: ${money(charges.platform_fee)} → ${money(draft.platformFee)}`)
  }
  if (differs(charges.default_packaging_fee, draft.packagingFee)) {
    payload.default_packaging_fee = fromHundredths(toHundredths(draft.packagingFee) ?? 0)
    changes.push(`Default packaging charge: ${money(charges.default_packaging_fee)} → ${money(draft.packagingFee)}`)
  }
  const zoneFees: Record<string, string> = {}
  for (const zone of charges.zones) {
    const next = draft.zoneFees[zone.code] ?? ''
    if (!next.trim() || (zone.delivery_fee !== null && !differs(zone.delivery_fee, next))) continue
    zoneFees[zone.code] = fromHundredths(toHundredths(next) ?? 0)
    const before = zone.delivery_fee === null ? 'not set' : money(zone.delivery_fee)
    changes.push(`Delivery fee in ${zone.name}: ${before} → ${money(next)}`)
  }
  if (Object.keys(zoneFees).length > 0) payload.zone_delivery_fees = zoneFees
  if (charges.gst_enabled !== draft.gstEnabled) {
    payload.gst_enabled = draft.gstEnabled
    changes.push(`GST: ${charges.gst_enabled ? 'on' : 'off'} → ${draft.gstEnabled ? 'on' : 'off'}`)
  }
  if (differs(charges.food_gst_rate, draft.foodGstRate)) {
    payload.food_gst_rate = fromHundredths(toHundredths(draft.foodGstRate) ?? 0)
    changes.push(`GST on food: ${rate(charges.food_gst_rate)} → ${rate(draft.foodGstRate)}`)
  }
  if (differs(charges.fees_gst_rate, draft.feesGstRate)) {
    payload.fees_gst_rate = fromHundredths(toHundredths(draft.feesGstRate) ?? 0)
    changes.push(`GST on fees: ${rate(charges.fees_gst_rate)} → ${rate(draft.feesGstRate)}`)
  }
  return { payload, changes }
}

/**
 * The draft as bill settings for one zone, or null while a field it needs is invalid.
 * A blank zone fee, or no zone at all, previews as "no fee set": the standard charge applies.
 */
export function settingsFromDraft(draft: ChargesDraft, zoneCode: string | null): ChargeSettings | null {
  const platformFee = toHundredths(draft.platformFee)
  const packagingFee = toHundredths(draft.packagingFee)
  const zoneText = zoneCode ? (draft.zoneFees[zoneCode] ?? '').trim() : ''
  const deliveryFee = zoneText ? toHundredths(zoneText) : null
  const foodGstRate = toHundredths(draft.foodGstRate)
  const feesGstRate = toHundredths(draft.feesGstRate)
  if (
    platformFee === null ||
    packagingFee === null ||
    (zoneText && deliveryFee === null) ||
    foodGstRate === null ||
    feesGstRate === null
  ) {
    return null
  }
  return { platformFee, packagingFee, deliveryFee, gstEnabled: draft.gstEnabled, foodGstRate, feesGstRate }
}
