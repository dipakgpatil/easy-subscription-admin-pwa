export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}

/** Product codes are short, uppercase and unique: name letters plus a random suffix. */
export function deriveProductCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM'
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase()
  return `${letters}${suffix}`
}

/**
 * Reads coordinates from what admins actually paste: a Google Maps link
 * (".../@18.5155,73.9255,17z", "?q=18.5155,73.9255") or a plain "18.5155, 73.9255".
 */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const text = decodeURIComponent(input.trim())
  const patterns = [/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const latitude = Number(match[1])
      const longitude = Number(match[2])
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude }
    }
  }
  return null
}

export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
