/** Formatting and small UI pieces shared by admin screens. */

export function formatMoney(value: string | null | undefined): string {
  if (!value) {
    return 'Rs 0.00'
  }
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    return `Rs ${value}`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

export function formatRelativeStatus(flag: string): string {
  return flag.replaceAll('_', ' ').toLowerCase()
}

export function badgeTone(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'SETTLED':
    case 'SUCCESS':
      return 'is-positive'
    case 'PREPARING':
    case 'READY':
      return 'is-warning'
    case 'ASSIGNED':
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
    case 'PICKED_UP':
      return 'is-info'
    case 'PENDING':
      return 'is-neutral'
    case 'ESCALATED':
    case 'DELAY_RISK':
    case 'FAILED':
    case 'CANCELLED':
      return 'is-danger'
    default:
      return 'is-dark'
  }
}

export function phoneHref(mobileNo: string | null | undefined): string | null {
  if (!mobileNo) {
    return null
  }
  const normalized = mobileNo.trim().replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '')
  return normalized ? `tel:${normalized}` : null
}
