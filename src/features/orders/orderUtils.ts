export type OrderSection = 'overview' | 'kitchens' | 'delivery' | 'customer' | 'activity'

/** "just now", "12 min", "3 h 5 min", "2 days": how long an order has been around. */
export function orderAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const placed = new Date(iso).getTime()
  if (Number.isNaN(placed)) return '—'
  const minutes = Math.max(0, Math.floor((now - placed) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat('en-IN', sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** What each issue flag means for an operator, and where to fix it. */
export const ISSUES: Record<string, { label: string; hint: string; section: OrderSection; action: string }> = {
  DELAY_RISK: {
    label: 'Delayed',
    hint: 'Open for more than 30 minutes. Check which kitchen or step is holding it up.',
    section: 'kitchens',
    action: 'Check kitchens',
  },
  AWAITING_RIDER: {
    label: 'Waiting for rider',
    hint: 'Food is ready but no rider has picked the order up yet.',
    section: 'delivery',
    action: 'Assign a rider',
  },
  PAYMENT_REVIEW: {
    label: 'Payment to review',
    hint: 'Delivered, but the payment is not marked as received.',
    section: 'customer',
    action: 'Review payment',
  },
}

export function issueLabel(flag: string): string {
  return ISSUES[flag]?.label ?? flag.replaceAll('_', ' ').toLowerCase()
}

const ORDER_FLOW = ['ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED'] as const

export const ACTION_LABELS: Record<string, string> = {
  ACCEPTED: 'Mark accepted',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  ASSIGNED: 'Assign rider',
  IN_TRANSIT: 'Mark picked up',
  COMPLETED: 'Mark delivered',
}

/** Steps a kitchen order can still move to, in order. */
export function nextSteps(status: string): string[] {
  const index = ORDER_FLOW.indexOf(status.toUpperCase() as (typeof ORDER_FLOW)[number])
  if (status.toUpperCase() === 'PENDING') return [...ORDER_FLOW]
  return index === -1 ? [] : ORDER_FLOW.slice(index + 1)
}

export function isFinished(status: string): boolean {
  return ['COMPLETED', 'DELIVERED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(status.toUpperCase())
}

export type DatePreset = 'ANY' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'ANY', label: 'Any time' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'WEEK', label: 'Last 7 days' },
  { key: 'MONTH', label: 'Last 30 days' },
]

/** Placed-date window in the admin's own day boundaries. */
export function dateRange(preset: DatePreset): { placedFrom?: string; placedTo?: string } {
  if (preset === 'ANY') return {}
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const day = 24 * 3600 * 1000
  switch (preset) {
    case 'TODAY':
      return { placedFrom: startOfToday.toISOString() }
    case 'YESTERDAY':
      return {
        placedFrom: new Date(startOfToday.getTime() - day).toISOString(),
        placedTo: startOfToday.toISOString(),
      }
    case 'WEEK':
      return { placedFrom: new Date(startOfToday.getTime() - 6 * day).toISOString() }
    case 'MONTH':
      return { placedFrom: new Date(startOfToday.getTime() - 29 * day).toISOString() }
  }
}

/** While a journey step is under way, name what is happening, not the finished state. */
const IN_PROGRESS_STAGE: Record<string, string> = {
  'Merchants accepted': 'Waiting for kitchens to accept',
  'Products being prepared': 'Kitchens preparing',
  'All merchant orders ready': 'Getting ready for pickup',
  'Rider assigned': 'Finding a rider',
  'Pickup in progress': 'Rider heading to pickup',
  Delivered: 'On the way to the customer',
}

export function stageLabel(journey: { current_stage: string; steps: { label: string; status: string }[] } | null, fallback: string): string {
  if (!journey) return fallback
  const step = journey.steps.find((candidate) => candidate.label === journey.current_stage)
  if (step && step.status.toUpperCase().startsWith('IN')) return IN_PROGRESS_STAGE[step.label] ?? journey.current_stage
  return journey.current_stage
}

/** Plain wording for journey and kitchen steps (the API keeps its own labels). */
const STEP_LABELS: Record<string, string> = {
  'order placed': 'Order placed',
  'merchants accepted': 'Kitchen accepted',
  'merchant accepted': 'Kitchen accepted',
  'products being prepared': 'Preparing',
  preparing: 'Preparing',
  'all merchant orders ready': 'Ready for pickup',
  'ready for pickup': 'Ready for pickup',
  'rider assigned': 'Rider assigned',
  'pickup in progress': 'Picked up',
  'in transit': 'On the way',
  delivered: 'Delivered',
}

export function stepLabel(label: string, kitchens = 1): string {
  const friendly = STEP_LABELS[label.trim().toLowerCase()] ?? label
  return kitchens > 1 && friendly === 'Kitchen accepted' ? 'Kitchens accepted' : friendly
}
