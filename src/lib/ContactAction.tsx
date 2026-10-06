import { PhoneCall } from 'lucide-react'

import { phoneHref } from './format'

export function ContactAction({ label, mobileNo }: { label: string; mobileNo: string | null | undefined }) {
  const href = phoneHref(mobileNo)
  if (!href) {
    return <span className="contact-missing">{label}: phone unavailable</span>
  }
  return (
    <a className="contact-link" href={href} aria-label={`Call ${label} at ${mobileNo}`}>
      <PhoneCall aria-hidden="true" />
      <span className="contact-link-label">Call {label}</span>
      <span>{mobileNo}</span>
    </a>
  )
}
