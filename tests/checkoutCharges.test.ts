// Run with `npm test` (Node's built-in runner; Node strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { AdminCheckoutCharges } from '../src/lib/types.ts'
import {
  computeBill,
  draftChanges,
  gstNote,
  draftErrors,
  draftFromCharges,
  formatRate,
  fromHundredths,
  percentOf,
  settingsFromDraft,
  toHundredths,
  type ChargeSettings,
} from '../src/features/operations/checkoutCharges.ts'

const DEFAULTS: ChargeSettings = {
  platformFee: 500,
  packagingFee: 0,
  deliveryFee: 3000,
  gstEnabled: false,
  foodGstRate: 500,
  feesGstRate: 1800,
}

const ORDER = { itemsTotal: 25000, restaurants: 1, couponDiscount: 0, couponCode: 'SAVE50' }

function charges(overrides: Partial<AdminCheckoutCharges> = {}): AdminCheckoutCharges {
  return {
    platform_fee: '5.00',
    default_packaging_fee: '0.00',
    gst_enabled: false,
    food_gst_rate: '5.00',
    fees_gst_rate: '18.00',
    updated_at: null,
    updated_by: null,
    zones: [
      { code: 'MAGARPATTA', name: 'Magarpatta City', is_active: true, delivery_fee: '30.00' },
      { code: 'HADAPSAR', name: 'Hadapsar', is_active: false, delivery_fee: '40.00' },
    ],
    ...overrides,
  }
}

test('parses decimal text into hundredths and back', () => {
  assert.equal(toHundredths('5'), 500)
  assert.equal(toHundredths(' 5.5 '), 550)
  assert.equal(toHundredths('12.05'), 1205)
  assert.equal(toHundredths('0'), 0)
  assert.equal(toHundredths('5.555'), null)
  assert.equal(toHundredths('-1'), null)
  assert.equal(toHundredths(''), null)
  assert.equal(toHundredths('abc'), null)
  assert.equal(fromHundredths(550), '5.50')
  assert.equal(fromHundredths(5), '0.05')
  assert.equal(formatRate(500), '5')
  assert.equal(formatRate(250), '2.5')
  assert.equal(formatRate(1000), '10')
})

test('rounds a percentage to the paisa half-up', () => {
  assert.equal(percentOf(3500, 1800), 630)
  // 5% of ₹0.30 is 1.5 paise: half-up gives 2.
  assert.equal(percentOf(30, 500), 2)
  // 5% of ₹0.29 is 1.45 paise: rounds down.
  assert.equal(percentOf(29, 500), 1)
})

test('default charges: ₹250 order pays items, ₹30 delivery and ₹5 platform fee, no GST', () => {
  const bill = computeBill(DEFAULTS, ORDER)
  assert.equal(bill.totalAmount, 28500)
  assert.equal(bill.taxesAmount, 0)
  assert.deepEqual(
    bill.lines.map((line) => [line.code, line.label, line.amount]),
    [
      ['ITEMS', 'Item total', 25000],
      ['DELIVERY', 'Delivery fee', 3000],
      ['PLATFORM_FEE', 'Platform fee', 500],
    ],
  )
})

test('GST is 5% of items plus packaging and 18% of delivery plus platform fee', () => {
  const bill = computeBill({ ...DEFAULTS, packagingFee: 1000, gstEnabled: true }, { ...ORDER, restaurants: 2 })
  assert.equal(bill.packagingFee, 2000)
  assert.equal(bill.foodGst, 1350) // 5% of ₹270
  assert.equal(bill.feesGst, 630) // 18% of ₹35
  assert.equal(bill.taxesAmount, 1980)
  assert.equal(bill.grandTotal, 25000 + 2000 + 3000 + 500 + 1980)
  const gst = bill.lines.find((line) => line.code === 'GST')
  assert.equal(gst?.note, '5% on food, 18% on delivery and platform fees')
  assert.equal(bill.lines.find((line) => line.code === 'PACKAGING')?.note, 'Charged by the restaurant')
})

test('coupons come off after taxes and never below zero', () => {
  const taxed = { ...DEFAULTS, gstEnabled: true }
  const bill = computeBill(taxed, { ...ORDER, couponDiscount: 5000 })
  assert.equal(bill.taxesAmount, 1250 + 630)
  assert.equal(bill.totalAmount, bill.grandTotal - 5000)
  assert.deepEqual(bill.lines.at(-1), { code: 'DISCOUNT', label: 'Coupon (SAVE50)', amount: -5000, note: null })

  const capped = computeBill(DEFAULTS, { ...ORDER, couponDiscount: 999999 })
  assert.equal(capped.discount, capped.grandTotal)
  assert.equal(capped.totalAmount, 0)
})

test('zero lines are hidden except a free delivery', () => {
  const bill = computeBill({ ...DEFAULTS, platformFee: 0, deliveryFee: 0 }, ORDER)
  assert.deepEqual(
    bill.lines.map((line) => line.code),
    ['ITEMS', 'DELIVERY'],
  )
  assert.equal(bill.totalAmount, 25000)
})

test('validates fees up to ₹500 and rates up to 28%', () => {
  const saved = charges()
  const draft = draftFromCharges(saved)
  assert.deepEqual(draftErrors(saved, draft), {})
  const errors = draftErrors(saved, {
    ...draft,
    platformFee: '500.01',
    packagingFee: 'ten',
    foodGstRate: '28.5',
    zoneFees: { ...draft.zoneFees, HADAPSAR: '' },
  })
  assert.deepEqual(Object.keys(errors).sort(), ['foodGstRate', 'packagingFee', 'platformFee', 'zone:HADAPSAR'])
})

test('sends only the changed fields, as decimal strings', () => {
  const saved = charges()
  const draft = draftFromCharges(saved)
  assert.deepEqual(draftChanges(saved, { ...draft, platformFee: '5' }), { payload: {}, changes: [] })

  const { payload, changes } = draftChanges(saved, {
    ...draft,
    platformFee: '7.5',
    gstEnabled: true,
    zoneFees: { ...draft.zoneFees, MAGARPATTA: '25' },
  })
  assert.deepEqual(payload, { platform_fee: '7.50', gst_enabled: true, zone_delivery_fees: { MAGARPATTA: '25.00' } })
  assert.equal(changes.length, 3)
  assert.match(changes[0], /^Platform fee: .*5\.00 → .*7\.50$/)
  assert.equal(changes[2], 'GST: off → on')
})

test('preview settings use the chosen zone and wait for valid input', () => {
  const draft = draftFromCharges(charges())
  assert.equal(settingsFromDraft(draft, 'HADAPSAR')?.deliveryFee, 4000)
  assert.equal(settingsFromDraft(draft, null)?.deliveryFee, null)
  assert.equal(settingsFromDraft({ ...draft, platformFee: 'x' }, 'MAGARPATTA'), null)
})

test('a zone without a fee stays blank until set, and previews the standard charge', () => {
  const saved = charges({
    zones: [
      { code: 'MAGARPATTA', name: 'Magarpatta City', is_active: true, delivery_fee: '30.00' },
      { code: 'KHARADI', name: 'Kharadi', is_active: true, delivery_fee: null },
    ],
  })
  const draft = draftFromCharges(saved)
  assert.equal(draft.zoneFees.KHARADI, '')
  assert.deepEqual(draftErrors(saved, draft), {})
  assert.deepEqual(draftChanges(saved, draft), { payload: {}, changes: [] })
  // A saved fee cannot be blanked: the API only sets fees, and ₹0 means free.
  assert.deepEqual(Object.keys(draftErrors(saved, { ...draft, zoneFees: { ...draft.zoneFees, MAGARPATTA: ' ' } })), [
    'zone:MAGARPATTA',
  ])

  const { payload, changes } = draftChanges(saved, { ...draft, zoneFees: { ...draft.zoneFees, KHARADI: '35' } })
  assert.deepEqual(payload, { zone_delivery_fees: { KHARADI: '35.00' } })
  assert.match(changes[0], /^Delivery fee in Kharadi: not set → .*35\.00$/)

  const settings = settingsFromDraft(draft, 'KHARADI')
  assert.equal(settings?.deliveryFee, null)
  const bill = computeBill(settings!, ORDER)
  assert.equal(bill.deliveryUnset, true)
  assert.equal(bill.deliveryFee, 0)
  assert.equal(bill.totalAmount, 25500)
  assert.match(bill.lines.find((line) => line.code === 'DELIVERY')?.note ?? '', /standard delivery charge/)
  assert.equal(computeBill(DEFAULTS, ORDER).deliveryUnset, false)
})

test('the GST note names only the parts that carry GST, as the customer bill does', () => {
  assert.equal(gstNote(500, 1800, 1050, 630), '5% on food, 18% on delivery and platform fees')
  assert.equal(gstNote(500, 1800, 0, 630), '18% on delivery and platform fees')
  assert.equal(gstNote(500, 1800, 1050, 0), '5% on food')
})
