import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'

import {
  getPartnerCompliance,
  getPartnerComplianceReviewUrl,
  reviewPartnerComplianceDocument,
} from '../../lib/api'
import type { AdminPartnerComplianceItem } from '../../lib/types'

type Props = { token: string }

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : 'Not set'
}

export default function ComplianceView({ token }: Props) {
  const [items, setItems] = useState<AdminPartnerComplianceItem[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await getPartnerCompliance(token))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load compliance documents.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const reviewQueue = useMemo(
    () => items.filter((item) => item.status_cd === 'SUBMITTED' || item.status_cd === 'REJECTED' || item.overdue),
    [items],
  )

  async function openDocument(item: AdminPartnerComplianceItem) {
    setBusyId(item.document_id)
    setError(null)
    try {
      const url = await getPartnerComplianceReviewUrl(token, item.document_id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open this document.')
    } finally {
      setBusyId(null)
    }
  }

  async function review(item: AdminPartnerComplianceItem, status: 'VERIFIED' | 'REJECTED') {
    const reason = status === 'REJECTED' ? window.prompt('Reason the partner can act on:')?.trim() : undefined
    if (status === 'REJECTED' && !reason) return
    setBusyId(item.document_id)
    setError(null)
    try {
      await reviewPartnerComplianceDocument(token, item.document_id, status, reason)
      await load()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to save the review.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head compact">
        <div>
          <p className="section-kicker">Partner records</p>
          <h2>Compliance review</h2>
        </div>
        <button className="icon-button" type="button" onClick={() => void load()} disabled={loading} title="Refresh documents" aria-label="Refresh documents">
          <RefreshCw className={loading ? 'is-spinning' : ''} aria-hidden="true" />
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="supporting-copy">
        Review only submitted documents. Missing items remain reminders until their due date; login and account access stay available.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Partner</th><th>Document</th><th>Status</th><th>Due</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {reviewQueue.map((item) => (
              <tr key={item.document_id}>
                <td><strong>{item.partner_name}</strong><br /><small>{item.partner_type} · {item.email_address ?? `#${item.partner_uid}`}</small></td>
                <td>{item.title}</td>
                <td><span className={`badge ${item.overdue ? 'is-danger' : ''}`}>{item.status_cd}</span></td>
                <td>{formatDate(item.due_at)}</td>
                <td>
                  <div className="submission-row-actions">
                    {item.submitted_at ? <button className="icon-button" type="button" onClick={() => void openDocument(item)} disabled={busyId === item.document_id} title="Open document" aria-label="Open document"><ExternalLink aria-hidden="true" /></button> : null}
                    {item.status_cd === 'SUBMITTED' ? <button className="icon-button" type="button" onClick={() => void review(item, 'VERIFIED')} disabled={busyId === item.document_id} title="Verify document" aria-label="Verify document"><ShieldCheck aria-hidden="true" /></button> : null}
                    {item.status_cd === 'SUBMITTED' ? <button className="icon-button" type="button" onClick={() => void review(item, 'REJECTED')} disabled={busyId === item.document_id} title="Reject document" aria-label="Reject document"><ShieldX aria-hidden="true" /></button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && reviewQueue.length === 0 ? <div className="empty-state"><strong>No documents need attention</strong><p>New uploads and overdue items will appear here.</p></div> : null}
    </section>
  )
}
