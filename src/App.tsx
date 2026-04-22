import { startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react'
import './App.css'
import {
  ApiError,
  appConfig,
  getDashboard,
  getMerchantPayoutDetail,
  getMerchantPayouts,
  getOrderDetail,
  getRiders,
  loginAdminWithGoogleIdToken,
  loginAdminWithMockGoogleProfile,
  markMerchantPayoutPaid,
  requestAdminOtp,
  searchOrders,
  updateOrderStatus,
  verifyAdminOtp,
} from './lib/api'
import { clearSession, readActiveTab, readSession, writeActiveTab, writeSession } from './lib/storage'
import type {
  AdminDashboard,
  AdminMerchantPayoutDetail,
  AdminMerchantPayoutSummary,
  AdminMerchantPayoutSummaryResult,
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderSearchResult,
  AdminRiderListResult,
  AdminSession,
} from './lib/types'

type ViewTab = 'overview' | 'orders' | 'riders' | 'payouts'
type LoginMode = 'google' | 'otp'

const ORDER_ACTIONS = ['ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED'] as const

function formatMoney(value: string | null | undefined): string {
  if (!value) {
    return 'Rs 0.00'
  }
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    return `Rs ${value}`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function formatRelativeStatus(flag: string): string {
  return flag.replaceAll('_', ' ').toLowerCase()
}

function badgeTone(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
    case 'SETTLED':
    case 'SUCCESS':
      return 'is-positive'
    case 'READY':
    case 'IN_TRANSIT':
    case 'PREPARING':
    case 'ASSIGNED':
      return 'is-warning'
    case 'PENDING':
      return 'is-neutral'
    default:
      return 'is-dark'
  }
}

function nextActionsForStatus(status: string): string[] {
  const currentIndex = ORDER_ACTIONS.indexOf(status as (typeof ORDER_ACTIONS)[number])
  if (currentIndex === -1) {
    return [...ORDER_ACTIONS]
  }
  return ORDER_ACTIONS.slice(currentIndex + 1)
}

function App() {
  const [session, setSession] = useState<AdminSession | null>(() => readSession())
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    const stored = readActiveTab()
    if (stored === 'overview' || stored === 'orders' || stored === 'riders' || stored === 'payouts') {
      return stored
    }
    return 'overview'
  })
  const [loginMode, setLoginMode] = useState<LoginMode>('google')
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [orders, setOrders] = useState<AdminOrderSearchResult | null>(null)
  const [selectedOrderNo, setSelectedOrderNo] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null)
  const [riders, setRiders] = useState<AdminRiderListResult | null>(null)
  const [payouts, setPayouts] = useState<AdminMerchantPayoutSummaryResult | null>(null)
  const [selectedMerchantUid, setSelectedMerchantUid] = useState<number | null>(null)
  const [selectedPayout, setSelectedPayout] = useState<AdminMerchantPayoutDetail | null>(null)
  const [googleEmail, setGoogleEmail] = useState('ops.cravix@gmail.com')
  const [googleGivenName, setGoogleGivenName] = useState('Ops')
  const [googleFamilyName, setGoogleFamilyName] = useState('Lead')
  const [mobileNo, setMobileNo] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const [orderQuery, setOrderQuery] = useState('')
  const [zoneFilter, setZoneFilter] = useState('')
  const [ordersPage, setOrdersPage] = useState(1)
  const [payoutQuery, setPayoutQuery] = useState('')
  const [payoutPage, setPayoutPage] = useState(1)
  const [payoutReference, setPayoutReference] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [googleScriptReady, setGoogleScriptReady] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const deferredOrderQuery = useDeferredValue(orderQuery)
  const deferredPayoutQuery = useDeferredValue(payoutQuery)

  const zoneOptions = dashboard?.zone_summary ?? []
  const liveRiders = riders?.items.filter((rider) => rider.latitude !== null && rider.longitude !== null) ?? []

  async function handleAuthSuccess(nextSession: AdminSession) {
    writeSession(nextSession)
    setSession(nextSession)
    setLastError(null)
    setOtpHint(null)
  }

  async function handleMockGoogleLogin() {
    setLoadingKey('login')
    setLastError(null)
    try {
      await handleAuthSuccess(
        await loginAdminWithMockGoogleProfile(googleEmail.trim(), googleGivenName.trim(), googleFamilyName.trim()),
      )
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  const completeGoogleLogin = useEffectEvent(async (credential: string) => {
    setLoadingKey('login')
    setLastError(null)
    try {
      await handleAuthSuccess(await loginAdminWithGoogleIdToken(credential))
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  })

  async function handleRequestOtp() {
    setLoadingKey('otp-request')
    setLastError(null)
    try {
      const response = await requestAdminOtp(mobileNo.trim())
      setOtpHint(response.otp ? `Demo OTP: ${response.otp}` : 'OTP sent successfully.')
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleVerifyOtp() {
    setLoadingKey('otp-verify')
    setLastError(null)
    try {
      await handleAuthSuccess(await verifyAdminOtp(mobileNo.trim(), otpCode.trim()))
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  const loadOverview = useEffectEvent(async () => {
    if (!session) {
      return
    }
    const payload = await getDashboard(session.access_token)
    setDashboard(payload)
  })

  const loadOrders = useEffectEvent(async () => {
    if (!session) {
      return
    }
    const payload = await searchOrders(session.access_token, {
      page: ordersPage,
      pageSize: 20,
      query: deferredOrderQuery,
      zoneCode: zoneFilter || undefined,
    })
    setOrders(payload)
    if (payload.items.length > 0 && !payload.items.some((item) => item.order_no === selectedOrderNo)) {
      setSelectedOrderNo(payload.items[0].order_no)
    }
    if (payload.items.length === 0) {
      setSelectedOrderNo(null)
      setSelectedOrder(null)
    }
  })

  const loadSelectedOrder = useEffectEvent(async () => {
    if (!session || selectedOrderNo === null) {
      return
    }
    const payload = await getOrderDetail(session.access_token, selectedOrderNo)
    setSelectedOrder(payload)
  })

  const loadRiders = useEffectEvent(async () => {
    if (!session) {
      return
    }
    const payload = await getRiders(session.access_token)
    setRiders(payload)
  })

  const loadPayouts = useEffectEvent(async () => {
    if (!session) {
      return
    }
    const payload = await getMerchantPayouts(session.access_token, {
      page: payoutPage,
      pageSize: 20,
      query: deferredPayoutQuery,
    })
    setPayouts(payload)
    if (payload.items.length > 0 && !payload.items.some((item) => item.merchant_uid === selectedMerchantUid)) {
      setSelectedMerchantUid(payload.items[0].merchant_uid)
    }
    if (payload.items.length === 0) {
      setSelectedMerchantUid(null)
      setSelectedPayout(null)
    }
  })

  const loadSelectedPayout = useEffectEvent(async () => {
    if (!session || selectedMerchantUid === null) {
      return
    }
    const payload = await getMerchantPayoutDetail(session.access_token, selectedMerchantUid)
    setSelectedPayout(payload)
  })

  const refreshActiveView = useEffectEvent(async () => {
    if (!session) {
      return
    }
    setLastError(null)
    try {
      await loadOverview()
      if (activeTab === 'orders') {
        await loadOrders()
        await loadSelectedOrder()
      }
      if (activeTab === 'riders') {
        await loadRiders()
      }
      if (activeTab === 'payouts') {
        await loadPayouts()
        await loadSelectedPayout()
      }
    } catch (error) {
      setLastError(getErrorMessage(error))
    }
  })

  useEffect(() => {
    if (session) {
      void refreshActiveView()
    }
  }, [session, activeTab, deferredOrderQuery, zoneFilter, ordersPage, deferredPayoutQuery, payoutPage])

  useEffect(() => {
    if (!session || activeTab !== 'orders' || selectedOrderNo === null) {
      return
    }
    void loadSelectedOrder().catch((error) => setLastError(getErrorMessage(error)))
  }, [session, activeTab, selectedOrderNo])

  useEffect(() => {
    if (!session || activeTab !== 'payouts' || selectedMerchantUid === null) {
      return
    }
    void loadSelectedPayout().catch((error) => setLastError(getErrorMessage(error)))
  }, [session, activeTab, selectedMerchantUid])

  useEffect(() => {
    if (!session) {
      return
    }
    const intervalId = window.setInterval(() => {
      void refreshActiveView()
    }, appConfig.dashboardPollIntervalMs)
    return () => window.clearInterval(intervalId)
  }, [session, activeTab, deferredOrderQuery, zoneFilter, ordersPage, deferredPayoutQuery, payoutPage])

  useEffect(() => {
    if (appConfig.googleClientId && window.google?.accounts?.id) {
      setGoogleScriptReady(true)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]')
    if (existing) {
      existing.addEventListener('load', () => setGoogleScriptReady(true), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleIdentity = 'true'
    script.addEventListener('load', () => setGoogleScriptReady(true), { once: true })
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (session || loginMode !== 'google' || !googleScriptReady || !googleButtonRef.current || !appConfig.googleClientId) {
      return
    }
    googleButtonRef.current.innerHTML = ''
    window.google?.accounts?.id?.initialize({
      client_id: appConfig.googleClientId,
      callback: ({ credential }) => {
        void completeGoogleLogin(credential)
      },
    })
    window.google?.accounts?.id?.renderButton(googleButtonRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 280,
    })
  }, [session, loginMode, googleScriptReady])

  useEffect(() => {
    writeActiveTab(activeTab)
  }, [activeTab])

  async function handleOrderAction(woNo: number, orderStatus: string) {
    if (!session) {
      return
    }
    setLoadingKey(`order-${woNo}-${orderStatus}`)
    setLastError(null)
    try {
      const riderUid = assignmentDrafts[woNo] ? Number.parseInt(assignmentDrafts[woNo], 10) : undefined
      await updateOrderStatus(session.access_token, woNo, { orderStatus, riderUid })
      await loadOverview()
      await loadOrders()
      await loadSelectedOrder()
      await loadRiders()
      await loadPayouts()
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleMarkPayoutPaid() {
    if (!session || selectedMerchantUid === null) {
      return
    }
    setLoadingKey('payout-paid')
    setLastError(null)
    try {
      const payload = await markMerchantPayoutPaid(session.access_token, selectedMerchantUid, {
        payoutReference: payoutReference.trim() || undefined,
        note: payoutNote.trim() || undefined,
      })
      setSelectedPayout(payload)
      await loadOverview()
      await loadPayouts()
      setPayoutReference('')
      setPayoutNote('')
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  function openOrder(item: AdminOrderListItem) {
    startTransition(() => {
      setActiveTab('orders')
      setSelectedOrderNo(item.order_no)
    })
  }

  function openMerchantPayout(summary: AdminMerchantPayoutSummary) {
    startTransition(() => {
      setActiveTab('payouts')
      setSelectedMerchantUid(summary.merchant_uid)
    })
  }

  function handleLogout() {
    clearSession()
    setSession(null)
    setDashboard(null)
    setOrders(null)
    setSelectedOrder(null)
    setSelectedOrderNo(null)
    setRiders(null)
    setPayouts(null)
    setSelectedMerchantUid(null)
    setSelectedPayout(null)
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <img className="auth-logo" src="/admin-logo.svg" alt="Cravix Admin" />
            <div className="auth-copy">
              <p className="eyebrow">Cravix Ops</p>
              <h1>Run orders, riders, and merchant settlements from one control tower.</h1>
              <p className="lede">
                Built for fast order search, zone monitoring, fulfillment intervention, and merchant payout reconciliation without bouncing between separate dashboards.
              </p>
            </div>
          </div>

          <div className="auth-mode-switch">
            <button className={loginMode === 'google' ? 'mode-pill is-active' : 'mode-pill'} onClick={() => setLoginMode('google')}>
              Google
            </button>
            <button className={loginMode === 'otp' ? 'mode-pill is-active' : 'mode-pill'} onClick={() => setLoginMode('otp')}>
              OTP
            </button>
          </div>

          {loginMode === 'google' ? (
            <section className="auth-panel">
              <div className="auth-panel-copy">
                <h2>Google sign-in</h2>
                <p>Use your Cravix admin Gmail account for the quickest access.</p>
              </div>
              {appConfig.googleClientId ? (
                <div className="google-button-slot" ref={googleButtonRef} />
              ) : (
                <div className="config-note">
                  Set <code>VITE_GOOGLE_CLIENT_ID</code> to render the production Google button.
                </div>
              )}
              {appConfig.allowMockGoogle ? (
                <div className="dev-auth-block">
                  <div className="dev-auth-header">
                    <strong>Development fallback</strong>
                    <span>Useful when Google client configuration is not ready yet.</span>
                  </div>
                  <label>
                    Gmail address
                    <input value={googleEmail} onChange={(event) => setGoogleEmail(event.target.value)} placeholder="ops.cravix@gmail.com" />
                  </label>
                  <div className="inline-grid">
                    <label>
                      First name
                      <input value={googleGivenName} onChange={(event) => setGoogleGivenName(event.target.value)} placeholder="Ops" />
                    </label>
                    <label>
                      Last name
                      <input value={googleFamilyName} onChange={(event) => setGoogleFamilyName(event.target.value)} placeholder="Lead" />
                    </label>
                  </div>
                  <button className="primary-button" onClick={() => void handleMockGoogleLogin()} disabled={loadingKey === 'login'}>
                    {loadingKey === 'login' ? 'Signing in...' : 'Use mock Google sign-in'}
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="auth-panel">
              <div className="auth-panel-copy">
                <h2>OTP sign-in</h2>
                <p>Use a registered admin mobile number to request a one-time password.</p>
              </div>
              <label>
                Mobile number
                <input value={mobileNo} onChange={(event) => setMobileNo(event.target.value)} placeholder="9000000099" />
              </label>
              <button className="secondary-button" onClick={() => void handleRequestOtp()} disabled={loadingKey === 'otp-request'}>
                {loadingKey === 'otp-request' ? 'Sending OTP...' : 'Send OTP'}
              </button>
              <label>
                OTP code
                <input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="1234" />
              </label>
              <button className="primary-button" onClick={() => void handleVerifyOtp()} disabled={loadingKey === 'otp-verify'}>
                {loadingKey === 'otp-verify' ? 'Verifying...' : 'Verify and continue'}
              </button>
              {otpHint ? <p className="otp-hint">{otpHint}</p> : null}
            </section>
          )}

          {lastError ? <p className="error-banner">{lastError}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/admin-logo.svg" alt="Cravix Admin" />
        </div>
        <nav className="sidebar-nav">
          {[
            ['overview', 'Overview'],
            ['orders', 'Orders'],
            ['riders', 'Riders'],
            ['payouts', 'Payouts'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-pill is-active' : 'nav-pill'}
              onClick={() => setActiveTab(tab as ViewTab)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="operator-chip">
            <strong>{session.display_name ?? 'Cravix Admin'}</strong>
            <span>{session.email_address ?? session.mobile_no ?? 'Administrator'}</span>
          </div>
          <button className="ghost-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operations Control</p>
            <h1>
              {activeTab === 'overview' && 'Control tower overview'}
              {activeTab === 'orders' && 'Order search and intervention'}
              {activeTab === 'riders' && 'Rider live operations'}
              {activeTab === 'payouts' && 'Merchant payout desk'}
            </h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => void refreshActiveView()}>
              Refresh
            </button>
          </div>
        </header>

        {lastError ? <p className="error-banner in-app">{lastError}</p> : null}

        {activeTab === 'overview' ? (
          <section className="overview-grid">
            <div className="stats-grid">
              <StatCard label="Active Orders" value={String(dashboard?.active_orders ?? 0)} tone="warning" />
              <StatCard label="Ready For Pickup" value={String(dashboard?.ready_for_pickup ?? 0)} tone="warning" />
              <StatCard label="In Transit" value={String(dashboard?.in_transit ?? 0)} tone="neutral" />
              <StatCard label="Completed Today" value={String(dashboard?.completed_today ?? 0)} tone="positive" />
              <StatCard label="Online Riders" value={String(dashboard?.online_riders ?? 0)} tone="positive" />
              <StatCard label="Merchant Payout Due" value={formatMoney(dashboard?.pending_merchant_payout_amount)} tone="warning" />
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Zones</p>
                  <h2>Zone-wise operational load</h2>
                </div>
              </div>
              <div className="zone-grid">
                {zoneOptions.map((zone) => (
                  <button
                    key={zone.zone_code ?? zone.zone_name ?? 'unknown-zone'}
                    className={zoneFilter === (zone.zone_code ?? '') ? 'zone-card is-selected' : 'zone-card'}
                    onClick={() => {
                      setZoneFilter(zone.zone_code ?? '')
                      setActiveTab('orders')
                    }}
                  >
                    <strong>{zone.zone_name ?? 'Unmapped zone'}</strong>
                    <span>{zone.zone_code ?? 'No zone code'}</span>
                    <div className="zone-metrics">
                      <MetricChip label="Active" value={String(zone.active_orders)} />
                      <MetricChip label="Completed" value={String(zone.completed_today)} />
                      <MetricChip label="Riders" value={String(zone.online_riders)} />
                    </div>
                    <p>{formatMoney(zone.pending_merchant_payout_amount)} pending merchant payout</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Attention</p>
                  <h2>Orders needing operator eyes</h2>
                </div>
              </div>
              <div className="order-stack">
                {(dashboard?.attention_orders ?? []).map((item) => (
                  <button key={item.order_no} className="list-card" onClick={() => openOrder(item)}>
                    <div className="list-card-top">
                      <strong>#{item.order_no}</strong>
                      <span className={`badge ${badgeTone(item.order_status)}`}>{item.order_status}</span>
                    </div>
                    <p>{item.delivery_address ?? 'No delivery address yet'}</p>
                    <div className="tag-row">
                      {item.issue_flags.map((flag) => (
                        <span key={flag} className="tiny-flag">
                          {formatRelativeStatus(flag)}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
                {dashboard?.attention_orders.length === 0 ? <EmptyState title="Quiet board" body="No attention orders are flagged right now." /> : null}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Recent Orders</p>
                  <h2>Jump straight into the latest queue</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Zone</th>
                      <th>Status</th>
                      <th>Merchant</th>
                      <th>Rider</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.recent_orders ?? []).map((item) => (
                      <tr key={item.order_no} onClick={() => openOrder(item)}>
                        <td>
                          <strong>#{item.order_no}</strong>
                          <span>{item.customer_name ?? 'Guest'}</span>
                        </td>
                        <td>{item.service_zone_name ?? item.service_zone_code ?? 'No zone'}</td>
                        <td>
                          <span className={`badge ${badgeTone(item.order_status)}`}>{item.order_status}</span>
                        </td>
                        <td>{item.merchant_names.join(', ') || 'Unassigned'}</td>
                        <td>{item.rider_names.join(', ') || 'Not assigned'}</td>
                        <td>{item.payment_status ?? 'No payment'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'orders' ? (
          <section className="split-layout">
            <section className="panel list-panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Orders</p>
                  <h2>Search and filter live or historical parent orders</h2>
                </div>
              </div>
              <div className="filter-grid">
                <label>
                  Search
                  <input
                    value={orderQuery}
                    onChange={(event) => {
                      setOrdersPage(1)
                      setOrderQuery(event.target.value)
                    }}
                    placeholder="Order no, customer, merchant, rider, address"
                  />
                </label>
                <label>
                  Zone
                  <select
                    value={zoneFilter}
                    onChange={(event) => {
                      setOrdersPage(1)
                      setZoneFilter(event.target.value)
                    }}
                  >
                    <option value="">All zones</option>
                    {zoneOptions.map((zone) => (
                      <option key={zone.zone_code ?? zone.zone_name ?? 'zone'} value={zone.zone_code ?? ''}>
                        {zone.zone_name ?? zone.zone_code ?? 'Unknown'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="order-stack">
                {(orders?.items ?? []).map((item) => (
                  <button
                    key={item.order_no}
                    className={selectedOrderNo === item.order_no ? 'list-card is-selected' : 'list-card'}
                    onClick={() => setSelectedOrderNo(item.order_no)}
                  >
                    <div className="list-card-top">
                      <div>
                        <strong>#{item.order_no}</strong>
                        <span>{item.customer_name ?? 'Guest customer'}</span>
                      </div>
                      <span className={`badge ${badgeTone(item.order_status)}`}>{item.order_status}</span>
                    </div>
                    <p>{item.delivery_address ?? 'No delivery address saved'}</p>
                    <div className="meta-row">
                      <span>{item.service_zone_name ?? item.service_zone_code ?? 'No zone'}</span>
                      <span>{formatMoney(item.payment_amount)}</span>
                    </div>
                    <div className="tag-row">
                      {item.merchant_names.slice(0, 2).map((merchant) => (
                        <span key={merchant} className="tiny-flag">
                          {merchant}
                        </span>
                      ))}
                      {item.issue_flags.map((flag) => (
                        <span key={flag} className="tiny-flag warning">
                          {formatRelativeStatus(flag)}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
                {orders?.items.length === 0 ? <EmptyState title="No matching orders" body="Try another search term or clear the zone filter." /> : null}
              </div>
              <PaginationBar
                page={orders?.page ?? ordersPage}
                total={orders?.total ?? 0}
                pageSize={orders?.page_size ?? 20}
                onPrevious={() => setOrdersPage((current) => Math.max(1, current - 1))}
                onNext={() => setOrdersPage((current) => current + 1)}
              />
            </section>

            <section className="panel detail-panel">
              {selectedOrder ? (
                <>
                  <div className="panel-head">
                    <div>
                      <p className="section-kicker">Order Detail</p>
                      <h2>#{selectedOrder.order_no}</h2>
                    </div>
                    <span className={`badge ${badgeTone(selectedOrder.order_status)}`}>{selectedOrder.order_status}</span>
                  </div>

                  <div className="cards-grid">
                    <DetailCard title="Customer" body={selectedOrder.customer.name ?? 'Unknown customer'} meta={selectedOrder.customer.mobile_no ?? 'No phone'} />
                    <DetailCard title="Delivery" body={selectedOrder.delivery.full_address ?? 'No address'} meta={selectedOrder.delivery.service_zone_name ?? selectedOrder.delivery.service_zone_code ?? 'No zone'} />
                    <DetailCard title="Payment" body={selectedOrder.payment.payment_status ?? 'No payment'} meta={formatMoney(selectedOrder.payment.payment_amount)} />
                    <DetailCard title="Placed On" body={formatDateTime(selectedOrder.order_placed_on)} meta={selectedOrder.issue_flags.length ? selectedOrder.issue_flags.map(formatRelativeStatus).join(' • ') : 'Healthy'} />
                  </div>

                  <div className="fulfillment-stack">
                    {selectedOrder.fulfillment_groups.map((group) => (
                      <article key={group.wo_no} className="fulfillment-card">
                        <div className="fulfillment-head">
                          <div>
                            <p className="section-kicker">Fulfillment #{group.wo_no}</p>
                            <h3>{group.merchant?.display_name ?? 'Unassigned merchant'}</h3>
                            <p>{group.merchant?.location_label ?? 'No merchant location label'}</p>
                          </div>
                          <div className="status-cluster">
                            <span className={`badge ${badgeTone(group.order_status)}`}>{group.order_status}</span>
                            {group.payout_status ? <span className={`badge ${badgeTone(group.payout_status)}`}>{group.payout_status}</span> : null}
                          </div>
                        </div>

                        <div className="fulfillment-meta">
                          <span>Subtotal {formatMoney(group.subtotal_amount)}</span>
                          <span>Prep {group.estimated_prep_minutes ? `${group.estimated_prep_minutes} min` : 'Not set'}</span>
                          <span>{group.rider?.display_name ?? 'No rider assigned yet'}</span>
                        </div>

                        {group.rider && group.rider.latitude !== null && group.rider.longitude !== null ? (
                          <a
                            className="maps-link"
                            href={`https://maps.google.com/?q=${group.rider.latitude},${group.rider.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open rider live location
                          </a>
                        ) : null}

                        <div className="timeline-grid">
                          {group.timeline.map((step) => (
                            <div key={`${group.wo_no}-${step.label}`} className="timeline-step">
                              <span className={`badge ${badgeTone(step.status)}`}>{step.status}</span>
                              <strong>{step.label}</strong>
                              <small>{formatDateTime(step.timestamp)}</small>
                            </div>
                          ))}
                        </div>

                        <div className="item-list">
                          {group.items.map((item) => (
                            <div key={`${group.wo_no}-${item.item_no}`} className="item-row">
                              <div className="item-copy">
                                <strong>{item.product_name}</strong>
                                <span>{item.product_code}</span>
                              </div>
                              <span>x {item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="action-row">
                          <select
                            value={assignmentDrafts[group.wo_no] ?? ''}
                            onChange={(event) =>
                              setAssignmentDrafts((current) => ({
                                ...current,
                                [group.wo_no]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Pick rider for assignment actions</option>
                            {liveRiders.map((rider) => (
                              <option key={rider.rider_uid} value={String(rider.rider_uid)}>
                                {rider.display_name}
                              </option>
                            ))}
                          </select>
                          {nextActionsForStatus(group.order_status).map((action) => (
                            <button
                              key={action}
                              className={action === 'COMPLETED' ? 'secondary-button' : 'ghost-button'}
                              onClick={() => void handleOrderAction(group.wo_no, action)}
                              disabled={loadingKey === `order-${group.wo_no}-${action}`}
                            >
                              {loadingKey === `order-${group.wo_no}-${action}` ? 'Updating...' : action.replaceAll('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState title="Pick an order" body="Select any order from the left column to open the operator dashboard for that basket." />
              )}
            </section>
          </section>
        ) : null}

        {activeTab === 'riders' ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="section-kicker">Riders</p>
                <h2>Live fleet visibility</h2>
              </div>
            </div>
            <div className="rider-grid">
              {(riders?.items ?? []).map((rider) => (
                <article key={rider.rider_uid} className="rider-card">
                  <div className="list-card-top">
                    <div>
                      <strong>{rider.display_name}</strong>
                      <span>{rider.vehicle_type ?? 'Vehicle not set'}</span>
                    </div>
                    <span className={`badge ${badgeTone(rider.availability_status)}`}>{rider.availability_status}</span>
                  </div>
                  <p>{rider.mobile_no ?? 'No mobile number saved'}</p>
                  <div className="meta-row">
                    <span>{rider.active_order_no ? `On order #${rider.active_order_no}` : 'No active order'}</span>
                    <span>{formatMoney(rider.pending_payout_amount)} pending</span>
                  </div>
                  <small>{formatDateTime(rider.location_updated_at)}</small>
                  {rider.latitude !== null && rider.longitude !== null ? (
                    <a
                      className="maps-link"
                      href={`https://maps.google.com/?q=${rider.latitude},${rider.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open current location
                    </a>
                  ) : (
                    <span className="muted-line">Location not reported yet</span>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === 'payouts' ? (
          <section className="split-layout">
            <section className="panel list-panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Payouts</p>
                  <h2>Merchant settlement queue</h2>
                </div>
              </div>
              <label>
                Search merchants
                <input
                  value={payoutQuery}
                  onChange={(event) => {
                    setPayoutPage(1)
                    setPayoutQuery(event.target.value)
                  }}
                  placeholder="Merchant name or location"
                />
              </label>
              <div className="order-stack">
                {(payouts?.items ?? []).map((summary) => (
                  <button
                    key={summary.merchant_uid}
                    className={selectedMerchantUid === summary.merchant_uid ? 'list-card is-selected' : 'list-card'}
                    onClick={() => openMerchantPayout(summary)}
                  >
                    <div className="list-card-top">
                      <div>
                        <strong>{summary.merchant_name}</strong>
                        <span>{summary.location_label ?? 'No location label'}</span>
                      </div>
                      <span className="badge is-warning">{formatMoney(summary.pending_payout_amount)}</span>
                    </div>
                    <div className="meta-row">
                      <span>{summary.completed_orders} completed orders</span>
                      <span>{summary.pending_orders} pending payouts</span>
                    </div>
                    <small>Last paid {formatDateTime(summary.last_paid_at)}</small>
                  </button>
                ))}
              </div>
              <PaginationBar
                page={payouts?.page ?? payoutPage}
                total={payouts?.total ?? 0}
                pageSize={payouts?.page_size ?? 20}
                onPrevious={() => setPayoutPage((current) => Math.max(1, current - 1))}
                onNext={() => setPayoutPage((current) => current + 1)}
              />
            </section>

            <section className="panel detail-panel">
              {selectedPayout ? (
                <>
                  <div className="panel-head">
                    <div>
                      <p className="section-kicker">Merchant Detail</p>
                      <h2>{selectedPayout.summary.merchant_name}</h2>
                    </div>
                    <span className="badge is-warning">{formatMoney(selectedPayout.summary.pending_payout_amount)} due</span>
                  </div>

                  <div className="cards-grid">
                    <DetailCard title="Pending" body={formatMoney(selectedPayout.summary.pending_payout_amount)} meta={`${selectedPayout.summary.pending_orders} orders`} />
                    <DetailCard title="Paid" body={formatMoney(selectedPayout.summary.paid_payout_amount)} meta="Settled externally" />
                    <DetailCard title="Total Earned" body={formatMoney(selectedPayout.summary.total_payout_amount)} meta={`${selectedPayout.summary.completed_orders} completed`} />
                    <DetailCard title="Last Settlement" body={formatDateTime(selectedPayout.summary.last_paid_at)} meta={selectedPayout.summary.location_label ?? 'No location label'} />
                  </div>

                  <div className="settlement-box">
                    <label>
                      Reference
                      <input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} placeholder="bank-transfer-001" />
                    </label>
                    <label>
                      Notes
                      <textarea value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} placeholder="Settled externally through bank transfer" rows={3} />
                    </label>
                    <button className="primary-button" onClick={() => void handleMarkPayoutPaid()} disabled={loadingKey === 'payout-paid'}>
                      {loadingKey === 'payout-paid' ? 'Marking paid...' : 'Mark pending payouts paid'}
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Customer</th>
                          <th>Zone</th>
                          <th>Payout</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPayout.orders.map((order) => (
                          <tr key={order.wo_no}>
                            <td>
                              <strong>#{order.wo_no}</strong>
                              <span>{formatDateTime(order.earned_at)}</span>
                            </td>
                            <td>{order.customer_name ?? 'Guest'}</td>
                            <td>{order.service_zone_code ?? 'No zone'}</td>
                            <td>{formatMoney(order.payout_amount)}</td>
                            <td>
                              <span className={`badge ${badgeTone(order.payout_status)}`}>{order.payout_status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <EmptyState title="Select a merchant" body="Choose a merchant from the left panel to inspect due amounts and mark payouts settled." />
              )}
            </section>
          </section>
        ) : null}
      </section>
    </main>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function DetailCard({ title, body, meta }: { title: string; body: string; meta: string }) {
  return (
    <article className="detail-card">
      <span>{title}</span>
      <strong>{body}</strong>
      <small>{meta}</small>
    </article>
  )
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric-chip">
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function PaginationBar({
  page,
  total,
  pageSize,
  onPrevious,
  onNext,
}: {
  page: number
  total: number
  pageSize: number
  onPrevious: () => void
  onNext: () => void
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination-bar">
      <span>
        Page {page} of {maxPage}
      </span>
      <div className="pagination-actions">
        <button className="ghost-button" onClick={onPrevious} disabled={page <= 1}>
          Previous
        </button>
        <button className="ghost-button" onClick={onNext} disabled={page >= maxPage}>
          Next
        </button>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something unexpected went wrong.'
}

export default App
