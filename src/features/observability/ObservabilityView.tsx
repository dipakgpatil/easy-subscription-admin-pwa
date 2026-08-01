import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'

import { ApiError, getOperationalEvents, getObservabilitySummary, reportAdminClientError } from '../../lib/api'
import type { OperationalEvent, OperationalEventResult, ObservabilitySummary } from '../../lib/types'

type ObservabilityMode = 'errors' | 'security'

type Props = {
  mode: ObservabilityMode
  token: string
}

const EMPTY_RESULT: OperationalEventResult = {
  total: 0,
  page: 1,
  pageSize: 25,
  items: [],
}

function countryName(code: string | null): string {
  if (!code) return 'Unknown'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown time'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function eventIdentity(event: OperationalEvent): string {
  if (event.user_id !== null) {
    return event.user_display_name || event.user_email || `User #${event.user_id}`
  }
  return event.anonymous_id ? `Anonymous ${event.anonymous_id}` : 'Anonymous source'
}

function EventTable({ events }: { events: OperationalEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <strong>No matching events</strong>
        <span>Try a broader search or clear one of the filters.</span>
      </div>
    )
  }

  return (
    <div className="event-table-wrap">
      <table className="event-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>User or source</th>
            <th>Country</th>
            <th>Flow</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.event_uid}>
              <td>
                <strong>{formatTimestamp(event.occurred_at)}</strong>
                <small>{event.request_id ? `Request ${event.request_id}` : event.event_uid}</small>
              </td>
              <td>
                <span className={`event-severity severity-${event.severity.toLowerCase()}`}>
                  {event.severity}
                </span>
                <strong>{event.event_type.replaceAll('_', ' ')}</strong>
                <small>{event.user_message || event.error_code || 'No customer-facing message'}</small>
                <details>
                  <summary>Technical context</summary>
                  <dl className="event-detail-list">
                    <div><dt>Source</dt><dd>{event.source}</dd></div>
                    <div><dt>Exception</dt><dd>{event.exception_type || 'None'}</dd></div>
                    <div><dt>Fingerprint</dt><dd>{event.fingerprint || 'None'}</dd></div>
                    <div><dt>Platform</dt><dd>{event.platform || 'Unknown'} {event.app_version || ''}</dd></div>
                    <div><dt>Duration</dt><dd>{event.duration_ms === null ? 'Unknown' : `${event.duration_ms} ms`}</dd></div>
                    <div><dt>Integrity</dt><dd>{event.integrity_valid ? 'Verified' : 'Check failed'}</dd></div>
                  </dl>
                </details>
              </td>
              <td>
                <strong>{eventIdentity(event)}</strong>
                <small>{event.user_email || (event.source_ip ? `Source ${event.source_ip}` : 'No account')}</small>
              </td>
              <td>
                <strong>{countryName(event.country_code)}</strong>
                <small>{event.country_source?.replaceAll('_', ' ') || 'No country signal'}</small>
                {event.network_country_code ? (
                  <small>Edge: {countryName(event.network_country_code)} {event.network_edge || ''}</small>
                ) : null}
              </td>
              <td>
                <strong>{event.flow || 'Unknown flow'}</strong>
                <small>{[event.method, event.endpoint].filter(Boolean).join(' ') || 'Client-side event'}</small>
              </td>
              <td>
                <strong>{event.status_code ?? 'Client'}</strong>
                <small>{event.error_code || event.category}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ObservabilityView({ mode, token }: Props) {
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null)
  const [events, setEvents] = useState<OperationalEventResult>(EMPTY_RESULT)
  const [loginEvents, setLoginEvents] = useState<OperationalEvent[]>([])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [severity, setSeverity] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const category = mode === 'errors' ? 'ERROR' : 'SECURITY'
      const [summaryPayload, eventPayload, loginPayload] = await Promise.all([
        getObservabilitySummary(token),
        getOperationalEvents(token, {
          page,
          pageSize: 25,
          query: deferredQuery,
          category,
          source: source || undefined,
          severity: severity || undefined,
          countryCode: countryCode || undefined,
        }),
        mode === 'security'
          ? getOperationalEvents(token, {
              page: 1,
              pageSize: 10,
              category: 'AUTH',
              eventType: 'LOGIN_SUCCESS',
              countryCode: countryCode || undefined,
            })
          : Promise.resolve(EMPTY_RESULT),
      ])
      setSummary(summaryPayload)
      setEvents(eventPayload)
      setLoginEvents(loginPayload.items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load observability events')
      if (!(loadError instanceof ApiError)) {
        void reportAdminClientError(`admin_${mode}_screen`, loadError, token)
      }
    } finally {
      setLoading(false)
    }
  }, [countryCode, deferredQuery, mode, page, severity, source, token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [countryCode, deferredQuery, mode, severity, source])

  const totalPages = Math.max(Math.ceil(events.total / events.pageSize), 1)
  const countryOptions = useMemo(
    () => summary?.country_activity.map((item) => item.country_code) ?? [],
    [summary],
  )

  return (
    <section className="observability-view">
      <div className="stats-grid observability-stats">
        {mode === 'errors' ? (
          <>
            <article className="stat-card tone-warning"><span>Errors, 24 hours</span><strong>{summary?.total_errors ?? 0}</strong></article>
            <article className="stat-card tone-neutral"><span>Backend</span><strong>{summary?.backend_errors ?? 0}</strong></article>
            <article className="stat-card tone-neutral"><span>Client apps</span><strong>{summary?.client_errors ?? 0}</strong></article>
            <article className="stat-card tone-positive"><span>Affected users</span><strong>{summary?.affected_users ?? 0}</strong></article>
          </>
        ) : (
          <>
            <article className="stat-card tone-warning"><span>Security signals</span><strong>{summary?.security_events ?? 0}</strong></article>
            <article className="stat-card tone-warning"><span>Authentication failures</span><strong>{summary?.authentication_failures ?? 0}</strong></article>
            <article className="stat-card tone-warning"><span>Authorization failures</span><strong>{summary?.authorization_failures ?? 0}</strong></article>
            <article className="stat-card tone-neutral"><span>Rate limited</span><strong>{summary?.rate_limit_events ?? 0}</strong></article>
            <article className="stat-card tone-positive"><span>Successful logins</span><strong>{summary?.successful_logins ?? 0}</strong></article>
            <article className="stat-card tone-neutral"><span>Anonymous sources</span><strong>{summary?.anonymous_sources ?? 0}</strong></article>
          </>
        )}
      </div>

      {mode === 'security' ? (
        <section className="panel country-activity-panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Login geography</p>
              <h2>Observed countries in the last 24 hours</h2>
            </div>
          </div>
          <div className="country-activity-grid">
            {(summary?.country_activity ?? []).map((item) => (
              <article className="detail-card" key={item.country_code}>
                <span>{countryName(item.country_code)}</span>
                <strong>{item.login_count} logins</strong>
                <small>{item.unique_users} users · last {formatTimestamp(item.last_seen_at)}</small>
              </article>
            ))}
            {summary?.country_activity.length === 0 ? (
              <div className="empty-state"><strong>No country signals yet</strong><span>New login events will appear here after deployment.</span></div>
            ) : null}
          </div>
          <p className="muted-line">Country is a client-locale or trusted proxy signal. Railway edge country is shown separately and is never treated as precise user location.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">{mode === 'errors' ? 'Error ledger' : 'Security ledger'}</p>
            <h2>{mode === 'errors' ? 'What users and services experienced' : 'Rejected and suspicious access attempts'}</h2>
          </div>
          <button className="ghost-button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="observability-filters">
          <label>
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Request ID, user, flow, error..." />
          </label>
          <label>
            Source
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">All sources</option>
              <option value="API">Backend API</option>
              <option value="CUSTOMER_FLUTTER">Customer app</option>
              <option value="ADMIN_PWA">Admin PWA</option>
              <option value="RIDER_APP">Rider app</option>
              <option value="MERCHANT_APP">Merchant app</option>
            </select>
          </label>
          <label>
            Severity
            <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              <option value="">All severities</option>
              <option value="WARNING">Warning</option>
              <option value="ERROR">Error</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>
          <label>
            Country
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              <option value="">All countries</option>
              {countryOptions.map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="error-banner in-app">{error}</p> : null}
        <EventTable events={events.items} />
        <div className="pagination-bar">
          <span>Page {events.page} of {totalPages} · {events.total} events</span>
          <div className="pagination-actions">
            <button className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</button>
            <button className="ghost-button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </div>
      </section>

      {mode === 'security' ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Recent access</p>
              <h2>Successful login trail</h2>
            </div>
          </div>
          <EventTable events={loginEvents} />
        </section>
      ) : null}
    </section>
  )
}
