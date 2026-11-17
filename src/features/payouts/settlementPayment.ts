import type { SettlementMethod } from '../../lib/types'

/** What an admin records about a payment, rider or merchant. Dates are YYYY-MM-DD, India time. */
export type PaymentDraft = {
  method: SettlementMethod
  reference: string
  paidOn: string
  note: string
}

export const METHODS: { value: SettlementMethod; label: string }[] = [
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'OTHER', label: 'Other' },
]

export function methodLabel(value: string): string {
  return METHODS.find((method) => method.value === value)?.label ?? value
}

// en-CA formats as YYYY-MM-DD, the value a date input and the API use.
const INDIA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today in India, whatever the admin's own clock says. */
export function indiaToday(): string {
  return INDIA_DAY.format(new Date())
}

/** The India-time day of an API timestamp. */
export function indiaDay(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? null : INDIA_DAY.format(parsed)
}

/** "3 Nov 2026" for a YYYY-MM-DD day. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function newPaymentDraft(method: SettlementMethod = 'UPI'): PaymentDraft {
  return { method, reference: '', paidOn: indiaToday(), note: '' }
}

/**
 * A transfer leaves a bank-issued transaction number (UTR or UPI reference), and that number is
 * what matches the payment to the bank statement. The API refuses a transfer without one.
 */
export function needsReference(method: SettlementMethod, amount: number): boolean {
  return (method === 'UPI' || method === 'BANK_TRANSFER') && amount !== 0
}

export function referenceLabel(method: SettlementMethod, required: boolean): string {
  const optional = required ? '' : ' (optional)'
  switch (method) {
    case 'UPI':
      return `UPI transaction ID${optional}`
    case 'BANK_TRANSFER':
      return `Bank UTR / transaction number${optional}`
    case 'CASH':
      return 'Receipt or note (optional)'
    default:
      return `Reference${optional}`
  }
}

export function referencePlaceholder(method: SettlementMethod): string {
  switch (method) {
    case 'UPI':
      return '12 digits, e.g. 430912345678'
    case 'BANK_TRANSFER':
      return 'e.g. HDFCN52026110312'
    case 'CASH':
      return 'e.g. Handed over at hub'
    default:
      return 'Cheque number or other reference'
  }
}

/** Amounts are decimal strings; add them in paise so 0.1 + 0.2 stays 0.30. */
export function sumAmounts(values: string[]): string {
  const paise = values.reduce((total, value) => total + Math.round(Number.parseFloat(value || '0') * 100), 0)
  return (paise / 100).toFixed(2)
}
