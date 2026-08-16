import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getAdministrators,
  grantAdministrator,
  revokeAdministrator,
} from '../../lib/api'
import type { AdminAdministrator } from '../../lib/types'

type AdministratorDraft = {
  fullName: string
  emailAddress: string
  mobileNo: string
}

const EMPTY_DRAFT: AdministratorDraft = {
  fullName: '',
  emailAddress: '',
  mobileNo: '',
}

function displayDate(value: string | null): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function administratorName(administrator: AdminAdministrator): string {
  return administrator.display_name || administrator.email_address || `User #${administrator.user_id}`
}

export default function AdministratorsView({ token }: { token: string }) {
  const [administrators, setAdministrators] = useState<AdminAdministrator[]>([])
  const [draft, setDraft] = useState<AdministratorDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getAdministrators(token)
      setAdministrators(result.items)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load administrators.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const administrator = await grantAdministrator(token, {
        fullName: draft.fullName,
        emailAddress: draft.emailAddress,
        mobileNo: draft.mobileNo || undefined,
      })
      setAdministrators((current) => {
        const existingIndex = current.findIndex((item) => item.user_id === administrator.user_id)
        if (existingIndex === -1) return [...current, administrator]
        return current.map((item) => (item.user_id === administrator.user_id ? administrator : item))
      })
      setDraft(EMPTY_DRAFT)
      setMessage(`${administratorName(administrator)} can sign in with their approved Google account.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to grant administrator access.')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(administrator: AdminAdministrator) {
    if (!window.confirm(`Remove administrator access for ${administratorName(administrator)}?`)) return
    setRemovingUserId(administrator.user_id)
    setMessage(null)
    setError(null)
    try {
      await revokeAdministrator(token, administrator.user_id)
      setAdministrators((current) => current.filter((item) => item.user_id !== administrator.user_id))
      setMessage(`Administrator access removed for ${administratorName(administrator)}.`)
    } catch (reason) {
      const detail = reason instanceof ApiError || reason instanceof Error ? reason.message : 'Unable to remove administrator access.'
      setError(detail)
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <section className="administrator-view">
      <section className="panel administrator-intro">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Access control</p>
            <h2>Administrators</h2>
          </div>
          <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </div>
        <p className="muted-line">
          Administrators use Google sign-in. Adding an email grants access only after its owner completes Google authentication.
        </p>
        <form className="administrator-form" onSubmit={submit}>
          <div className="inline-grid administrator-form-grid">
            <label>
              Full name
              <input
                value={draft.fullName}
                onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Operations lead"
                maxLength={100}
                required
              />
            </label>
            <label>
              Google email address
              <input
                value={draft.emailAddress}
                onChange={(event) => setDraft((current) => ({ ...current, emailAddress: event.target.value }))}
                type="email"
                placeholder="name@gmail.com"
                maxLength={50}
                required
              />
            </label>
          </div>
          <div className="administrator-form-actions">
            <label>
              Phone number (optional)
              <input
                value={draft.mobileNo}
                onChange={(event) => setDraft((current) => ({ ...current, mobileNo: event.target.value }))}
                inputMode="tel"
                placeholder="9876543210"
                maxLength={20}
              />
            </label>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Granting access' : 'Add administrator'}
            </button>
          </div>
        </form>
        {message ? <p className="success-banner administrator-message">{message}</p> : null}
        {error ? <p className="error-banner administrator-message">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-head compact">
          <div>
            <p className="section-kicker">Current roster</p>
            <h2>{administrators.length} administrator{administrators.length === 1 ? '' : 's'}</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="ops-table administrator-table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Google</th>
                <th>Last sign-in</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {administrators.map((administrator) => (
                <tr key={administrator.user_id}>
                  <td>
                    <strong>{administratorName(administrator)}</strong>
                    <span>{administrator.email_address ?? 'Email unavailable'}</span>
                    {administrator.mobile_no ? <span>{administrator.mobile_no}</span> : null}
                  </td>
                  <td>
                    <span className={`badge ${administrator.googleLinked ? 'is-positive' : 'is-neutral'}`}>
                      {administrator.googleLinked ? 'Linked' : 'Awaiting sign-in'}
                    </span>
                  </td>
                  <td>{displayDate(administrator.lastLoginDate)}</td>
                  <td>
                    {administrator.isProtectedOwner ? (
                      <span className="badge is-dark">Protected owner</span>
                    ) : (
                      <button
                        className="ghost-button danger-button"
                        type="button"
                        onClick={() => void remove(administrator)}
                        disabled={removingUserId === administrator.user_id}
                      >
                        {removingUserId === administrator.user_id ? 'Removing' : 'Remove access'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && administrators.length === 0 ? <p className="muted-line">No administrators are available.</p> : null}
      </section>
    </section>
  )
}
