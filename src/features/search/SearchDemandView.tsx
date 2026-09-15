import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, getSearchAnalytics } from '../../lib/api'
import type { SearchAnalyticsSummary, SearchOutcome, SearchTermStat } from '../../lib/types'

type Props = {
  token: string
}

type OutcomeFilter = 'ALL' | SearchOutcome

const OUTCOME_LABELS: Record<SearchOutcome, string> = {
  ZERO_RESULT: 'No results',
  LOW_RESULT: 'Thin coverage',
  HEALTHY: 'Well served',
}

const OUTCOME_TONES: Record<SearchOutcome, string> = {
  ZERO_RESULT: 'tone-warning',
  LOW_RESULT: 'tone-neutral',
  HEALTHY: 'tone-positive',
}

const RANGE_PRESETS: { label: string; days: number }[] = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - offsetDays)
  return d.toISOString().slice(0, 10)
}

function formatDay(value: string): string {
  try {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return value
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

function TermTable({
  terms,
  emptyMessage,
}: {
  terms: SearchTermStat[]
  emptyMessage: string
}) {
  if (terms.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>
  }

  return (
    <div className="event-table-wrap">
      <table className="event-table">
        <thead>
          <tr>
            <th>Term</th>
            <th>Searches</th>
            <th>People</th>
            <th>Avg results</th>
            <th>No-result rate</th>
            <th>Last searched</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term) => (
            <tr key={term.term}>
              <td>
                <strong>{term.term}</strong>
                {term.sample_raw_term && term.sample_raw_term !== term.term ? (
                  <div className="muted-line">typed as “{term.sample_raw_term}”</div>
                ) : null}
              </td>
              <td>{term.searches}</td>
              <td>{term.distinct_searchers}</td>
              <td>{term.average_result_count}</td>
              <td>{percent(term.zero_result_rate)}</td>
              <td className="muted-line">{formatDateTime(term.last_searched_at)}</td>
              <td>
                <span className={OUTCOME_TONES[term.outcome_cd]}>
                  {OUTCOME_LABELS[term.outcome_cd]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SearchDemandView({ token }: Props) {
  const [rangeDays, setRangeDays] = useState(14)
  const [zoneCode, setZoneCode] = useState('')
  const [outcome, setOutcome] = useState<OutcomeFilter>('ALL')
  const [queryText, setQueryText] = useState('')
  const [data, setData] = useState<SearchAnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getSearchAnalytics(token, {
        from: isoDay(rangeDays - 1),
        to: isoDay(0),
        zoneCode: zoneCode || undefined,
        outcome: outcome === 'ALL' ? undefined : outcome,
        q: queryText.trim() || undefined,
      })
      setData(result)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load search demand.')
    } finally {
      setLoading(false)
    }
  }, [token, rangeDays, zoneCode, outcome, queryText])

  useEffect(() => {
    void load()
  }, [load])

  const busiestDay = useMemo(() => {
    if (!data || data.days.length === 0) return null
    return data.days.reduce((best, day) => (day.searches > best.searches ? day : best))
  }, [data])

  return (
    <section className="observability-view">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Demand</p>
          <h2>What customers are searching for</h2>
          <p className="muted-line">
            Terms that return nothing are the shortlist for sourcing products or onboarding a
            merchant. A term can be well served in one zone and unserved in another, so check the
            zone split before acting.
          </p>
        </div>
      </div>

      <div className="observability-filters">
        <label>
          Range
          <select
            value={rangeDays}
            onChange={(event) => setRangeDays(Number(event.target.value))}
          >
            {RANGE_PRESETS.map((preset) => (
              <option key={preset.days} value={preset.days}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zone
          <input
            value={zoneCode}
            placeholder="All zones"
            onChange={(event) => setZoneCode(event.target.value.trim().toUpperCase())}
          />
        </label>
        <label>
          Status
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as OutcomeFilter)}
          >
            <option value="ALL">All</option>
            <option value="ZERO_RESULT">No results</option>
            <option value="LOW_RESULT">Thin coverage</option>
            <option value="HEALTHY">Well served</option>
          </select>
        </label>
        <label>
          Contains
          <input
            value={queryText}
            placeholder="Filter terms"
            onChange={(event) => setQueryText(event.target.value)}
          />
        </label>
        <button type="button" className="ghost-button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {data ? (
        <>
          <div className="stats-grid observability-stats">
            <div className="stat-card">
              <span className="section-kicker">Searches</span>
              <strong>{data.total_searches}</strong>
              <span className="muted-line">{data.distinct_searchers} people</span>
            </div>
            <div className="stat-card">
              <span className="section-kicker">Distinct terms</span>
              <strong>{data.distinct_terms}</strong>
              <span className="muted-line">
                {busiestDay ? `Busiest ${formatDay(busiestDay.day)}` : 'No activity'}
              </span>
            </div>
            <div className="stat-card">
              <span className="section-kicker">No results</span>
              <strong className={data.zero_result_rate > 0.2 ? 'tone-warning' : undefined}>
                {data.zero_result_searches}
              </strong>
              <span className="muted-line">{percent(data.zero_result_rate)} of searches</span>
            </div>
            <div className="stat-card">
              <span className="section-kicker">Unmet terms</span>
              <strong>{data.unmet_terms.length}</strong>
              <span className="muted-line">candidates to source</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Unmet demand</h3>
              <p className="muted-line">
                Searched for, nothing returned. Ranked by how often it was asked for.
              </p>
            </div>
            <TermTable
              terms={data.unmet_terms}
              emptyMessage="Every search in this window returned something."
            />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>By zone</h3>
              <p className="muted-line">Where the gap actually is.</p>
            </div>
            {data.zones.length === 0 ? (
              <p className="empty-state">No searches in this window.</p>
            ) : (
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Zone</th>
                      <th>Searches</th>
                      <th>Distinct terms</th>
                      <th>No results</th>
                      <th>No-result rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.zones.map((zone) => {
                      const rate = zone.searches ? zone.zero_result_searches / zone.searches : 0
                      return (
                        <tr key={zone.service_zone_code ?? 'unknown'}>
                          <td>
                            <strong>{zone.service_zone_code ?? 'Unknown zone'}</strong>
                          </td>
                          <td>{zone.searches}</td>
                          <td>{zone.distinct_terms}</td>
                          <td>{zone.zero_result_searches}</td>
                          <td className={rate > 0.2 ? 'tone-warning' : undefined}>
                            {percent(rate)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Daily activity</h3>
              <p className="muted-line">Newest first.</p>
            </div>
            {data.days.length === 0 ? (
              <p className="empty-state">No searches in this window.</p>
            ) : (
              <div className="event-table-wrap">
                <table className="event-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Searches</th>
                      <th>People</th>
                      <th>Distinct terms</th>
                      <th>No results</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((day) => (
                      <tr key={day.day}>
                        <td>
                          <strong>{formatDay(day.day)}</strong>
                          <div className="muted-line">{day.day}</div>
                        </td>
                        <td>{day.searches}</td>
                        <td>{day.distinct_searchers}</td>
                        <td>{day.distinct_terms}</td>
                        <td
                          className={
                            day.searches && day.zero_result_searches / day.searches > 0.2
                              ? 'tone-warning'
                              : undefined
                          }
                        >
                          {day.zero_result_searches}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Most searched</h3>
              <p className="muted-line">Everything, whether or not it returned results.</p>
            </div>
            <TermTable terms={data.top_terms} emptyMessage="No searches in this window." />
          </div>
        </>
      ) : null}
    </section>
  )
}
