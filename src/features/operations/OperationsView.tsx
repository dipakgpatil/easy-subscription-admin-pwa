import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Megaphone, Pencil, Power, RefreshCw, Trash2, X } from 'lucide-react'

import {
  createAnnouncement,
  deleteAnnouncement,
  getOperations,
  setZoneOrdering,
  updateAnnouncement,
} from '../../lib/api'
import type {
  AdminAnnouncement,
  AdminOperations,
  AdminZoneOperations,
  AnnouncementAudience,
  AnnouncementInput,
  AnnouncementTone,
} from '../../lib/types'

type Props = { token: string }

const DEFAULT_CLOSED_MESSAGE = "We're not open yet. Ordering starts at 8 AM."
const MESSAGE_LIMIT = 160

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL: 'Everyone',
  ZONE: 'One zone',
  OUT_OF_AREA: 'Outside our zones',
}

const STATUS_TONES: Record<AdminAnnouncement['status'], string> = {
  LIVE: 'is-positive',
  SCHEDULED: 'is-neutral',
  EXPIRED: 'is-neutral',
  DISABLED: 'is-warning',
}

/** `datetime-local` value in the browser's own time zone. */
function toLocalInput(value: string | Date | null): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

/** Back to an absolute ISO timestamp so the API stores the intended moment. */
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

type Draft = {
  message: string
  tone: AnnouncementTone
  audience: AnnouncementAudience
  zoneCode: string
  startsAt: string
  expiresAt: string
  active: boolean
}

function emptyDraft(): Draft {
  return {
    message: '',
    tone: 'INFO',
    audience: 'ALL',
    zoneCode: '',
    startsAt: '',
    expiresAt: toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)),
    active: true,
  }
}

export default function OperationsView({ token }: Props) {
  const [data, setData] = useState<AdminOperations | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [closingZone, setClosingZone] = useState<AdminZoneOperations | null>(null)
  const [closedMessage, setClosedMessage] = useState(DEFAULT_CLOSED_MESSAGE)
  const [reopensAt, setReopensAt] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<number | null>(null)

  const run = useCallback(async (key: string, action: () => Promise<AdminOperations>, done?: string) => {
    setBusy(key)
    setError(null)
    setMessage(null)
    try {
      setData(await action())
      if (done) setMessage(done)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong.')
      return false
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void run('load', () => getOperations(token))
  }, [run, token])

  function startClosing(zone: AdminZoneOperations) {
    setClosingZone(zone)
    setClosedMessage(zone.closed_message || DEFAULT_CLOSED_MESSAGE)
    setReopensAt(toLocalInput(zone.reopens_at))
  }

  async function closeZone() {
    if (!closingZone) return
    const ok = await run(
      `zone-${closingZone.code}`,
      () =>
        setZoneOrdering(token, closingZone.code, {
          ordering_open: false,
          closed_message: closedMessage.trim() || null,
          reopens_at: fromLocalInput(reopensAt),
        }),
      `${closingZone.name} is closed. Customers can browse but cannot order.`,
    )
    if (ok) setClosingZone(null)
  }

  async function openZone(zone: AdminZoneOperations) {
    if (!window.confirm(`Open ${zone.name} for orders now? Make sure riders are online.`)) return
    await run(
      `zone-${zone.code}`,
      () =>
        setZoneOrdering(token, zone.code, {
          ordering_open: true,
          closed_message: zone.closed_message,
          reopens_at: null,
        }),
      `${zone.name} is open for orders.`,
    )
  }

  function draftInput(): AnnouncementInput | null {
    const expires = fromLocalInput(draft.expiresAt)
    if (!draft.message.trim() || !expires) {
      setError('Enter a message and an expiry.')
      return null
    }
    if (draft.audience === 'ZONE' && !draft.zoneCode) {
      setError('Choose the zone for this banner.')
      return null
    }
    return {
      message: draft.message.trim(),
      tone: draft.tone,
      audience: draft.audience,
      service_zone_code: draft.audience === 'ZONE' ? draft.zoneCode : null,
      starts_at: fromLocalInput(draft.startsAt),
      expires_at: expires,
      active: draft.active,
    }
  }

  async function saveAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = draftInput()
    if (!payload) return
    const ok = await run(
      'announcement',
      () => (editingId ? updateAnnouncement(token, editingId, payload) : createAnnouncement(token, payload)),
      editingId ? 'Banner updated.' : 'Banner published.',
    )
    if (ok) {
      setEditingId(null)
      setDraft(emptyDraft())
    }
  }

  function editAnnouncement(item: AdminAnnouncement) {
    setEditingId(item.id)
    setDraft({
      message: item.message,
      tone: item.tone,
      audience: item.audience,
      zoneCode: item.service_zone_code ?? '',
      startsAt: toLocalInput(item.starts_at),
      expiresAt: toLocalInput(item.expires_at),
      active: item.active,
    })
  }

  async function removeAnnouncement(item: AdminAnnouncement) {
    if (!window.confirm(`Delete the banner "${item.message}"?`)) return
    await run(`delete-${item.id}`, () => deleteAnnouncement(token, item.id), 'Banner deleted.')
    if (editingId === item.id) {
      setEditingId(null)
      setDraft(emptyDraft())
    }
  }

  const zones = data?.zones ?? []

  return (
    <section className="operations-view">
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Daily operations</p>
            <h2>Zone ordering</h2>
          </div>
          <button
            className="ghost-button operations-icon-button"
            type="button"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void run('load', () => getOperations(token))}
            disabled={busy !== null}
          >
            <RefreshCw className={busy === 'load' ? 'is-spinning' : undefined} size={18} />
          </button>
        </div>
        <p className="muted-line">
          Closed zones keep showing their menu with your message as a banner, but no order can be placed.
        </p>
        <div className="operations-zone-list">
          {zones.map((zone) => (
            <article key={zone.code} className="operations-zone-card">
              <div className="operations-zone-head">
                <strong>{zone.name}</strong>
                <span className={`badge ${zone.ordering_open ? 'is-positive' : 'is-warning'}`}>
                  {zone.ordering_open ? 'Taking orders' : 'Closed'}
                </span>
                {!zone.is_active ? <span className="badge is-neutral">Zone inactive</span> : null}
              </div>
              {!zone.ordering_open ? (
                <p className="operations-zone-note">
                  “{zone.closed_message || DEFAULT_CLOSED_MESSAGE}”
                  {zone.reopens_at ? ` · Opens ${formatWhen(zone.reopens_at)}` : ''}
                </p>
              ) : null}
              <p className="muted-line">
                {zone.ordering_updated_at
                  ? `Changed ${formatWhen(zone.ordering_updated_at)}${zone.ordering_updated_by ? ` by ${zone.ordering_updated_by}` : ''}`
                  : 'Never changed'}
              </p>

              {closingZone?.code === zone.code ? (
                <div className="operations-close-form">
                  <label>
                    Message customers see ({closedMessage.length}/{MESSAGE_LIMIT})
                    <input
                      value={closedMessage}
                      maxLength={MESSAGE_LIMIT}
                      onChange={(event) => setClosedMessage(event.target.value)}
                    />
                  </label>
                  <label>
                    Opens at (optional, shown to customers)
                    <input type="datetime-local" value={reopensAt} onChange={(event) => setReopensAt(event.target.value)} />
                  </label>
                  <div className="operations-actions">
                    <button className="ghost-button" type="button" onClick={() => setClosingZone(null)}>
                      <X size={16} /> Cancel
                    </button>
                    <button
                      className="primary-button danger-button"
                      type="button"
                      onClick={() => void closeZone()}
                      disabled={busy !== null}
                    >
                      {busy === `zone-${zone.code}` ? <LoaderCircle className="is-spinning" size={16} /> : <Power size={16} />}
                      Close ordering
                    </button>
                  </div>
                </div>
              ) : (
                <div className="operations-actions">
                  {zone.ordering_open ? (
                    <button className="ghost-button danger-button" type="button" onClick={() => startClosing(zone)} disabled={busy !== null}>
                      <Power size={16} /> Close ordering
                    </button>
                  ) : (
                    <>
                      <button className="ghost-button" type="button" onClick={() => startClosing(zone)} disabled={busy !== null}>
                        <Pencil size={16} /> Edit message
                      </button>
                      <button className="primary-button" type="button" onClick={() => void openZone(zone)} disabled={busy !== null}>
                        {busy === `zone-${zone.code}` ? <LoaderCircle className="is-spinning" size={16} /> : <Power size={16} />}
                        Open for orders
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
          {data && zones.length === 0 ? <p className="muted-line">No service zones are configured.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Customer app</p>
            <h2>{editingId ? 'Edit banner' : 'Banners'}</h2>
          </div>
        </div>
        <form className="operations-banner-form" onSubmit={saveAnnouncement}>
          <label className="operations-wide">
            Message ({draft.message.length}/{MESSAGE_LIMIT})
            <input
              value={draft.message}
              maxLength={MESSAGE_LIMIT}
              placeholder="Now delivering in Magarpatta City. Coming to your area soon!"
              onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
              required
            />
          </label>
          <label>
            Show to
            <select
              value={draft.audience}
              onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value as AnnouncementAudience }))}
            >
              {(Object.keys(AUDIENCE_LABELS) as AnnouncementAudience[]).map((key) => (
                <option key={key} value={key}>{AUDIENCE_LABELS[key]}</option>
              ))}
            </select>
          </label>
          {draft.audience === 'ZONE' ? (
            <label>
              Zone
              <select
                value={draft.zoneCode}
                onChange={(event) => setDraft((current) => ({ ...current, zoneCode: event.target.value }))}
                required
              >
                <option value="">Choose a zone</option>
                {zones.map((zone) => <option key={zone.code} value={zone.code}>{zone.name}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            Style
            <select
              value={draft.tone}
              onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value as AnnouncementTone }))}
            >
              <option value="INFO">Info</option>
              <option value="SUCCESS">Good news</option>
              <option value="WARNING">Warning</option>
            </select>
          </label>
          <label>
            Starts (optional)
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
            />
          </label>
          <label>
            Expires
            <input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))}
              required
            />
          </label>
          {editingId ? (
            <label className="operations-checkbox">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
              />
              Active
            </label>
          ) : null}
          <div className="operations-actions operations-wide">
            {editingId ? (
              <button className="ghost-button" type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft()) }}>
                <X size={16} /> Cancel
              </button>
            ) : null}
            <button className="primary-button" type="submit" disabled={busy !== null}>
              {busy === 'announcement' ? <LoaderCircle className="is-spinning" size={16} /> : <Megaphone size={16} />}
              {editingId ? 'Save banner' : 'Publish banner'}
            </button>
          </div>
        </form>

        <div className="operations-banner-list">
          {(data?.announcements ?? []).map((item) => (
            <article key={item.id} className="operations-banner-row">
              <div>
                <div className="operations-zone-head">
                  <span className={`badge ${STATUS_TONES[item.status]}`}>{item.status}</span>
                  <span className="badge is-neutral">
                    {item.audience === 'ZONE'
                      ? zones.find((zone) => zone.code === item.service_zone_code)?.name ?? item.service_zone_code
                      : AUDIENCE_LABELS[item.audience]}
                  </span>
                </div>
                <p className="operations-banner-message">{item.message}</p>
                <p className="muted-line">
                  {item.starts_at ? `From ${formatWhen(item.starts_at)} · ` : ''}Until {formatWhen(item.expires_at)}
                  {item.created_by ? ` · by ${item.created_by}` : ''}
                </p>
              </div>
              <div className="operations-actions">
                <button className="ghost-button" type="button" onClick={() => editAnnouncement(item)} disabled={busy !== null}>
                  <Pencil size={16} /> Edit
                </button>
                <button
                  className="ghost-button danger-button"
                  type="button"
                  onClick={() => void removeAnnouncement(item)}
                  disabled={busy !== null}
                  aria-label={`Delete banner ${item.message}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          {data && data.announcements.length === 0 ? <p className="muted-line">No banners yet.</p> : null}
        </div>
      </section>
    </section>
  )
}
