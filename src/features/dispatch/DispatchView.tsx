import { useCallback, useEffect, useState } from 'react'

import { acknowledgeDispatchIncident, getDispatchIncidents } from '../../lib/api'
import type { DispatchIncident, DispatchIncidentResult } from '../../lib/types'

type Props = { token: string }

const EMPTY: DispatchIncidentResult = { total: 0, page: 1, pageSize: 25, items: [] }

function dateTime(value: string | null): string {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function incidentDetail(incident: DispatchIncident): string {
  const entries = Object.entries(incident.details ?? {})
  return entries.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' | ')
}

export default function DispatchView({ token }: Props) {
  const [result, setResult] = useState<DispatchIncidentResult>(EMPTY)
  const [status, setStatus] = useState('OPEN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await getDispatchIncidents(token, { page: 1, pageSize: 50, status: status || undefined }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dispatch incidents')
    } finally {
      setLoading(false)
    }
  }, [status, token])

  useEffect(() => { void load() }, [load])

  async function acknowledge(id: number) {
    try {
      const updated = await acknowledgeDispatchIncident(token, id)
      setResult((current) => ({
        ...current,
        items: current.items.map((incident) => incident.id === id ? updated : incident),
      }))
    } catch (acknowledgeError) {
      setError(acknowledgeError instanceof Error ? acknowledgeError.message : 'Unable to acknowledge incident')
    }
  }

  return (
    <section className="panel list-panel">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Dispatch watch</p>
          <h2>Unclaimed deliveries and merchant delays</h2>
        </div>
        <div className="topbar-actions">
          <select aria-label="Incident status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
            <option value="">All</option>
          </select>
          <button className="ghost-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </div>
      {error ? <p className="error-banner in-app">{error}</p> : null}
      {result.items.length === 0 ? (
        <div className="empty-state"><strong>No matching dispatch incidents</strong><span>New critical dispatch or merchant-response delays will appear here.</span></div>
      ) : (
        <div className="order-stack">
          {result.items.map((incident) => (
            <article className="list-card" key={incident.id}>
              <div className="list-card-top">
                <div>
                  <strong>{incident.title}</strong>
                  <span>Customer order #{incident.parent_wo_no} | {incident.service_zone_code ?? 'No zone'}</span>
                </div>
                <span className={`badge ${incident.status_cd === 'OPEN' ? 'is-warning' : 'is-neutral'}`}>{incident.status_cd}</span>
              </div>
              <p className="muted-line">{incidentDetail(incident) || incident.incident_type}</p>
              <div className="status-cluster">
                <span>First detected {dateTime(incident.first_detected_at)}</span>
                <span>Last seen {dateTime(incident.last_detected_at)}</span>
                <span>Assigned rider {incident.rider_uid ?? 'None'}</span>
                {incident.status_cd === 'OPEN' ? <button className="secondary-button" onClick={() => void acknowledge(incident.id)}>Acknowledge</button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
