import type { DispatchIncident } from '../../lib/types'

type IncidentText = Pick<DispatchIncident, 'incident_type' | 'parent_wo_no' | 'title' | 'details'>

/**
 * Merchant-delay incidents were titled with the kitchen's internal ticket ("order #178"),
 * which is not the number the customer, kitchen or rider know. Rebuild that title from the
 * customer's order number so stored incidents read correctly too.
 */
export function incidentTitle(incident: IncidentText): string {
  if (incident.incident_type.startsWith('MERCHANT_NO_RESPONSE')) {
    return `Kitchen has not accepted order #${incident.parent_wo_no}`
  }
  return incident.title
}

/** Detail keys with their own wording; null hides a key the card already shows. */
const DETAIL_TEXT: Record<string, (value: unknown) => string | null> = {
  parent_wo_no: () => null,
  service_zone_code: () => null,
  merchant_wo_no: (value) => `kitchen ticket ${String(value)}`,
  merchant_uid: (value) => `merchant ${String(value)}`,
}

export function incidentDetail(incident: IncidentText): string {
  return Object.entries(incident.details ?? {})
    .map(([key, value]) => (DETAIL_TEXT[key] ? DETAIL_TEXT[key](value) : `${key.replaceAll('_', ' ')}: ${String(value)}`))
    .filter((text): text is string => Boolean(text))
    .join(' | ')
}
