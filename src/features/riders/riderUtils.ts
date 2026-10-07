export const VEHICLES: { value: string; label: string }[] = [
  { value: 'BIKE', label: 'Motorbike' },
  { value: 'EV_BIKE', label: 'Electric bike' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'CYCLE', label: 'Cycle' },
]

export function vehicleLabel(value: string | null | undefined): string {
  return VEHICLES.find((vehicle) => vehicle.value === value)?.label ?? value ?? 'No vehicle'
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function seenAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const at = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime()
  if (Number.isNaN(at)) return 'unknown'
  const minutes = Math.max(0, Math.floor((now - at) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Dispatch treats a location older than two minutes as stale. */
export function locationIsFresh(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false
  const at = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime()
  return !Number.isNaN(at) && now - at < 2 * 60 * 1000
}

export type RiderFilter = 'ALL' | 'ONLINE' | 'BUSY' | 'OFFLINE' | 'SUSPENDED'

export function riderBucket(rider: { status_cd: string; availability_status: string }): Exclude<RiderFilter, 'ALL'> {
  if (rider.status_cd !== 'ACTIVE') return 'SUSPENDED'
  if (rider.availability_status === 'ONLINE') return 'ONLINE'
  if (rider.availability_status === 'BUSY') return 'BUSY'
  return 'OFFLINE'
}

export function zoneName(zones: { code: string; name: string }[], code: string): string {
  return zones.find((zone) => zone.code === code)?.name.replace(/, Pune$/, '') ?? code
}
