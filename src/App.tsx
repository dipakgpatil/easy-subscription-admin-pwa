import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import {
  Bike,
  ChefHat,
  CircleAlert,
  CircleCheckBig,
  CircleDot,
  Clock3,
  CreditCard,
  BellRing,
  LogOut,
  MapPin,
  Package,
  PhoneCall,
  RefreshCw,
  Route,
  ShoppingBag,
  Truck,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import './App.css'
import ObservabilityView from './features/observability/ObservabilityView'
import DispatchView from './features/dispatch/DispatchView'
import AdministratorsView from './features/administrators/AdministratorsView'
import {
  ApiError,
  assignProductToMerchant,
  appConfig,
  completeAdminGoogleRedirectLogin,
  connectAdminOrderStream,
  createCatalogProduct,
  creditReferralWallet,
  getDashboard,
  getOrderHistory,
  getMerchantPayoutDetail,
  getMerchantPayouts,
  getOrderDetail,
  getProductMerchantAssignments,
  getProvisionedMerchants,
  getReferralAnalytics,
  getReferralConfig,
  getReferralList,
  getRiders,
  loginAdminWithMockGoogleProfile,
  markMerchantPayoutPaid,
  requestAdminOtp,
  runReferralTest,
  searchOrders,
  updateOrderStatus,
  updateReferralConfig,
  verifyAdminOtp,
} from './lib/api'
import {
  clearSession,
  readActiveTab,
  readSession,
  readSidebarCollapsed,
  writeActiveTab,
  writeSession,
  writeSidebarCollapsed,
} from './lib/storage'
import type {
  AdminDashboard,
  AdminOrderHistory,
  AdminMerchantProfile,
  AdminMerchantPayoutDetail,
  AdminMerchantPayoutSummary,
  AdminMerchantPayoutSummaryResult,
  AdminOrderDetail,
  AdminOrderCreatedEvent,
  AdminOrderListItem,
  AdminOrderSearchResult,
  AdminReferralAnalytics,
  AdminReferralConfig,
  AdminReferralListResult,
  AdminRiderListResult,
  AdminSession,
  AdminProductMerchantAssignment,
  AdminWalletCreditResponse,
} from './lib/types'

type ViewTab = 'overview' | 'catalog' | 'orders' | 'history' | 'riders' | 'payouts' | 'referrals' | 'dispatch' | 'errors' | 'security' | 'administrators'
type LoginMode = 'google' | 'otp'

type CatalogProductDraft = {
  productCode: string
  productName: string
  categoryName: string
  price: string
  imageUrl: string
  description: string
}

const EMPTY_CATALOG_PRODUCT: CatalogProductDraft = {
  productCode: '',
  productName: '',
  categoryName: '',
  price: '',
  imageUrl: '',
  description: '',
}

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
    case 'PREPARING':
    case 'READY':
      return 'is-warning'
    case 'ASSIGNED':
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
    case 'PICKED_UP':
      return 'is-info'
    case 'PENDING':
      return 'is-neutral'
    case 'ESCALATED':
    case 'DELAY_RISK':
    case 'FAILED':
    case 'CANCELLED':
      return 'is-danger'
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

function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function normalizeReferralConfigForForm(config: AdminReferralConfig): AdminReferralConfig {
  return {
    ...config,
    startAt: toDateTimeInputValue(config.startAt),
    endAt: toDateTimeInputValue(config.endAt),
  }
}

function phoneHref(mobileNo: string | null | undefined): string | null {
  if (!mobileNo) {
    return null
  }
  const normalized = mobileNo.trim().replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '')
  return normalized ? `tel:${normalized}` : null
}

function ContactAction({ label, mobileNo }: { label: string; mobileNo: string | null | undefined }) {
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

function JourneyMarker({ label, status }: { label: string; status: string }) {
  const normalized = label.toUpperCase()
  const tone = badgeTone(status)
  const MarkerIcon =
    normalized.includes('DELIVER') || normalized.includes('PICKUP')
      ? Truck
      : normalized.includes('RIDER')
        ? Bike
        : normalized.includes('MERCHANT') || normalized.includes('PREPAR') || normalized.includes('READY')
          ? ChefHat
          : tone === 'is-positive'
            ? CircleCheckBig
            : tone === 'is-danger'
              ? CircleAlert
              : CircleDot

  return (
    <span className={`journey-step-icon ${tone}`} aria-hidden="true">
      <MarkerIcon />
    </span>
  )
}

function OrderJourney({ order }: { order: AdminOrderDetail }) {
  const journey = order.journey
  if (!journey) {
    return null
  }
  return (
    <section className="journey-panel" aria-label={`Order ${order.order_no} delivery journey`}>
      <div className="journey-head">
        <div className="journey-heading-copy">
          <span className="section-icon section-icon--route" aria-hidden="true"><Route /></span>
          <div>
            <p className="section-kicker">Fulfillment timeline</p>
            <h3>{journey.current_stage}</h3>
          </div>
        </div>
        <div className="status-cluster">
          {journey.dispatch_status ? <span className={`badge ${badgeTone(journey.dispatch_status)}`}>{journey.dispatch_status}</span> : null}
        </div>
      </div>
      <ol className="journey-flow">
        {journey.steps.map((step) => (
          <li key={step.label} className={`journey-step is-${step.status.toLowerCase().replaceAll('_', '-')}`}>
            <JourneyMarker label={step.label} status={step.status} />
            <span className="journey-step-status">{formatRelativeStatus(step.status)}</span>
            <strong>{step.label}</strong>
            <small>{formatDateTime(step.timestamp)}</small>
          </li>
        ))}
      </ol>
    </section>
  )
}

function App() {
  const [session, setSession] = useState<AdminSession | null>(() => readSession())
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    const stored = readActiveTab()
    if (stored === 'overview' || stored === 'catalog' || stored === 'orders' || stored === 'history' || stored === 'riders' || stored === 'payouts' || stored === 'referrals' || stored === 'dispatch' || stored === 'errors' || stored === 'security' || stored === 'administrators') {
      return stored
    }
    return 'overview'
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed())
  const [loginMode, setLoginMode] = useState<LoginMode>('google')
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [orderHistory, setOrderHistory] = useState<AdminOrderHistory | null>(null)
  const [catalogMerchants, setCatalogMerchants] = useState<AdminMerchantProfile[]>([])
  const [catalogAssignments, setCatalogAssignments] = useState<AdminProductMerchantAssignment[]>([])
  const [catalogProduct, setCatalogProduct] = useState<CatalogProductDraft>(EMPTY_CATALOG_PRODUCT)
  const [assignmentProductCode, setAssignmentProductCode] = useState('')
  const [assignmentMerchantUid, setAssignmentMerchantUid] = useState('')
  const [assignmentPrepMinutes, setAssignmentPrepMinutes] = useState('15')
  const [catalogResult, setCatalogResult] = useState<string | null>(null)
  const [orders, setOrders] = useState<AdminOrderSearchResult | null>(null)
  const [selectedOrderNo, setSelectedOrderNo] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null)
  const [riders, setRiders] = useState<AdminRiderListResult | null>(null)
  const [payouts, setPayouts] = useState<AdminMerchantPayoutSummaryResult | null>(null)
  const [referralConfig, setReferralConfig] = useState<AdminReferralConfig | null>(null)
  const [referralAnalytics, setReferralAnalytics] = useState<AdminReferralAnalytics | null>(null)
  const [referralList, setReferralList] = useState<AdminReferralListResult | null>(null)
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
  const [historyDays, setHistoryDays] = useState(30)
  const [ordersPage, setOrdersPage] = useState(1)
  const [payoutQuery, setPayoutQuery] = useState('')
  const [payoutPage, setPayoutPage] = useState(1)
  const [referralQuery, setReferralQuery] = useState('')
  const [referralStatus, setReferralStatus] = useState('')
  const [referralRewardStatus, setReferralRewardStatus] = useState('')
  const [referralPage, setReferralPage] = useState(1)
  const [payoutReference, setPayoutReference] = useState('')
  const [payoutNote, setPayoutNote] = useState('')
  const [referralRefereeUserId, setReferralRefereeUserId] = useState('')
  const [referralCodeDraft, setReferralCodeDraft] = useState('')
  const [referralDeviceId, setReferralDeviceId] = useState('')
  const [referralOrderNo, setReferralOrderNo] = useState('')
  const [walletCreditUserId, setWalletCreditUserId] = useState('')
  const [walletCreditPoints, setWalletCreditPoints] = useState('50')
  const [walletCreditNote, setWalletCreditNote] = useState('Manual referral test credit')
  const [referralTestResult, setReferralTestResult] = useState<string | null>(null)
  const [walletCreditResult, setWalletCreditResult] = useState<AdminWalletCreditResponse | null>(null)
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<string | null>(null)
  const [orderAlert, setOrderAlert] = useState<AdminOrderCreatedEvent | null>(null)
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting')
  const [lastError, setLastError] = useState<string | null>(null)
  const [googleScriptReady, setGoogleScriptReady] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const refreshActiveViewRef = useRef<() => Promise<boolean>>(async () => false)
  const announcedOrderNumbersRef = useRef(new Set<number>())
  const deferredOrderQuery = useDeferredValue(orderQuery)
  const deferredPayoutQuery = useDeferredValue(payoutQuery)
  const deferredReferralQuery = useDeferredValue(referralQuery)

  const zoneOptions = dashboard?.zone_summary ?? []
  const liveRiders = riders?.items?.filter((rider) => rider.latitude !== null && rider.longitude !== null) ?? []
  const selectedOrderRider = selectedOrder?.journey?.rider ?? selectedOrder?.fulfillment_groups.find((group) => group.rider)?.rider ?? null
  const primaryOrderIssue = selectedOrder?.issue_flags[0] ?? null
  const historyMaxOrders = Math.max(1, ...(orderHistory?.daily.map((day) => day.completed_orders) ?? [0]))

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

  const loadOverview = useCallback(async () => {
    if (!session) {
      return
    }
    const payload = await getDashboard(session.access_token, { zoneCode: zoneFilter || undefined })
    setDashboard(payload)
  }, [session, zoneFilter])

  const loadOrderHistory = useCallback(async () => {
    if (!session) {
      return
    }
    const payload = await getOrderHistory(session.access_token, {
      zoneCode: zoneFilter || undefined,
      days: historyDays,
    })
    setOrderHistory(payload)
  }, [historyDays, session, zoneFilter])

  const loadOrders = useCallback(async () => {
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
    if (selectedOrderNo !== null && !payload.items.some((item) => item.order_no === selectedOrderNo)) {
      setSelectedOrderNo(null)
      setSelectedOrder(null)
    }
  }, [deferredOrderQuery, ordersPage, selectedOrderNo, session, zoneFilter])

  const loadCatalogSetup = useCallback(async () => {
    if (!session) {
      return
    }
    const [merchants, assignments] = await Promise.all([
      getProvisionedMerchants(session.access_token),
      getProductMerchantAssignments(session.access_token),
    ])
    setCatalogMerchants(merchants)
    setCatalogAssignments(assignments)
    setAssignmentMerchantUid((current) => current || String(merchants[0]?.merchant_uid ?? ''))
  }, [session])

  const loadSelectedOrder = useCallback(async () => {
    if (!session || selectedOrderNo === null) {
      return
    }
    const payload = await getOrderDetail(session.access_token, selectedOrderNo)
    setSelectedOrder(payload)
  }, [selectedOrderNo, session])

  const loadRiders = useCallback(async () => {
    if (!session) {
      return
    }
    const payload = await getRiders(session.access_token)
    setRiders(payload)
  }, [session])

  const loadPayouts = useCallback(async () => {
    if (!session) {
      return
    }
    const payload = await getMerchantPayouts(session.access_token, {
      page: payoutPage,
      pageSize: 20,
      query: deferredPayoutQuery,
    })
    setPayouts(payload)
    setSelectedMerchantUid((current) =>
      payload.items.length > 0 && !payload.items.some((item) => item.merchant_uid === current)
        ? payload.items[0].merchant_uid
        : current,
    )
    if (payload.items.length === 0) {
      setSelectedMerchantUid(null)
      setSelectedPayout(null)
    }
  }, [deferredPayoutQuery, payoutPage, session])

  const loadSelectedPayout = useCallback(async () => {
    if (!session || selectedMerchantUid === null) {
      return
    }
    const payload = await getMerchantPayoutDetail(session.access_token, selectedMerchantUid)
    setSelectedPayout(payload)
  }, [selectedMerchantUid, session])

  const loadReferralAdmin = useCallback(async () => {
    if (!session) {
      return
    }
    const [configPayload, analyticsPayload, listPayload] = await Promise.all([
      getReferralConfig(session.access_token),
      getReferralAnalytics(session.access_token),
      getReferralList(session.access_token, {
        page: referralPage,
        pageSize: 20,
        query: deferredReferralQuery,
        status: referralStatus || undefined,
        rewardStatus: referralRewardStatus || undefined,
      }),
    ])
    setReferralConfig(normalizeReferralConfigForForm(configPayload))
    setReferralAnalytics(analyticsPayload)
    setReferralList(listPayload)
  }, [deferredReferralQuery, referralPage, referralRewardStatus, referralStatus, session])

  const refreshActiveView = useCallback(async (): Promise<boolean> => {
    if (!session) {
      return false
    }
    if (activeTab === 'errors' || activeTab === 'security' || activeTab === 'dispatch' || activeTab === 'administrators') {
      return false
    }
    setLastError(null)
    try {
      await loadOverview()
      if (activeTab === 'catalog') {
        await loadCatalogSetup()
      }
      if (activeTab === 'orders') {
        await loadOrders()
        await loadSelectedOrder()
        await loadRiders()
      }
      if (activeTab === 'history') {
        await loadOrderHistory()
      }
      if (activeTab === 'riders') {
        await loadRiders()
      }
      if (activeTab === 'payouts') {
        await loadPayouts()
        await loadSelectedPayout()
      }
      if (activeTab === 'referrals') {
        await loadReferralAdmin()
      }
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLogout('Your session expired. Please sign in again.')
        return false
      }
      setLastError(getErrorMessage(error))
      return false
    }
  }, [
    activeTab,
    loadCatalogSetup,
    loadOrders,
    loadOverview,
    loadOrderHistory,
    loadPayouts,
    loadReferralAdmin,
    loadRiders,
    loadSelectedOrder,
    loadSelectedPayout,
    session,
  ])

  useEffect(() => {
    refreshActiveViewRef.current = refreshActiveView
  }, [refreshActiveView])

  useEffect(() => {
    if (session) {
      void refreshActiveView()
    }
  }, [activeTab, refreshActiveView, session])

  useEffect(() => {
    if (!session) {
      return
    }
    return connectAdminOrderStream({
      token: session.access_token,
      zoneCode: zoneFilter || undefined,
      onStatusChange: setStreamStatus,
      onAuthenticationExpired: () => handleLogout('Your session expired. Please sign in again.'),
      onOrderCreated: (event) => {
        if (announcedOrderNumbersRef.current.has(event.order_no)) return
        announcedOrderNumbersRef.current.add(event.order_no)
        if (announcedOrderNumbersRef.current.size > 100) announcedOrderNumbersRef.current.clear()
        setOrderAlert(event)
        void refreshActiveViewRef.current()
      },
    })
  }, [session, zoneFilter])

  async function handleManualRefresh() {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      if (await refreshActiveView()) {
        setLastManualRefreshAt(new Date().toISOString())
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!session || activeTab !== 'orders' || selectedOrderNo === null) {
      return
    }
    void loadSelectedOrder().catch((error) => setLastError(getErrorMessage(error)))
  }, [session, activeTab, selectedOrderNo, loadSelectedOrder])

  useEffect(() => {
    if (!session || activeTab !== 'payouts' || selectedMerchantUid === null) {
      return
    }
    void loadSelectedPayout().catch((error) => setLastError(getErrorMessage(error)))
  }, [session, activeTab, selectedMerchantUid, loadSelectedPayout])

  useEffect(() => {
    if (!session || activeTab === 'catalog') {
      return
    }
    const intervalId = window.setInterval(() => {
      void refreshActiveView()
    }, appConfig.dashboardPollIntervalMs)
    return () => window.clearInterval(intervalId)
  }, [activeTab, refreshActiveView, session])

  async function handleCreateCatalogProduct() {
    if (!session) {
      return
    }
    const productCode = catalogProduct.productCode.trim().toUpperCase()
    const productName = catalogProduct.productName.trim()
    const categoryName = catalogProduct.categoryName.trim()
    const price = Number.parseFloat(catalogProduct.price)
    if (!productCode || !productName || !categoryName || !Number.isFinite(price) || price <= 0) {
      setLastError('Product code, name, category, and a positive price are required.')
      return
    }
    setLoadingKey('catalog-product')
    setLastError(null)
    setCatalogResult(null)
    try {
      const created = await createCatalogProduct(session.access_token, {
        productCode,
        productName,
        categoryName,
        price: price.toFixed(2),
        imageUrl: catalogProduct.imageUrl.trim() || undefined,
        description: catalogProduct.description.trim() || undefined,
      })
      setAssignmentProductCode(created.ProductCode)
      setCatalogProduct(EMPTY_CATALOG_PRODUCT)
      setCatalogResult(`${created.ProductCode} created. Assign it to a merchant to publish it in covered zones.`)
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleAssignProduct() {
    if (!session) {
      return
    }
    const productCode = assignmentProductCode.trim().toUpperCase()
    const merchantUid = Number.parseInt(assignmentMerchantUid, 10)
    const prepTimeMinutes = Number.parseInt(assignmentPrepMinutes, 10)
    if (!productCode || !Number.isFinite(merchantUid) || !Number.isFinite(prepTimeMinutes) || prepTimeMinutes < 1 || prepTimeMinutes > 180) {
      setLastError('Product code, merchant, and prep time from 1 to 180 minutes are required.')
      return
    }
    setLoadingKey('catalog-assignment')
    setLastError(null)
    setCatalogResult(null)
    try {
      const assignment = await assignProductToMerchant(session.access_token, productCode, {
        merchantUid,
        prepTimeMinutes,
      })
      await loadCatalogSetup()
      setCatalogResult(`${assignment.product_code} is active for ${assignment.merchant_name}.`)
      setAssignmentProductCode('')
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

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
    if (
      session ||
      window.location.pathname === '/auth/callback' ||
      loginMode !== 'google' ||
      !googleScriptReady ||
      !googleButtonRef.current ||
      !appConfig.googleClientId
    ) {
      return
    }
    googleButtonRef.current.innerHTML = ''
    window.google?.accounts?.id?.initialize({
      client_id: appConfig.googleClientId,
      ux_mode: 'redirect',
      login_uri: `${window.location.origin}/api/v1/admin/auth/google/redirect`,
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
    if (session || window.location.pathname !== '/auth/callback') {
      return
    }

    let cancelled = false
    setLoadingKey('google-redirect')
    setLastError(null)
    void completeAdminGoogleRedirectLogin()
      .then((nextSession) => {
        if (cancelled) return
        void handleAuthSuccess(nextSession)
        window.history.replaceState({}, document.title, '/')
      })
      .catch((error) => {
        if (!cancelled) {
          setLastError(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingKey(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    writeActiveTab(activeTab)
  }, [activeTab])

  useEffect(() => {
    writeSidebarCollapsed(sidebarCollapsed)
  }, [sidebarCollapsed])

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

  async function handleSaveReferralConfig() {
    if (!session || !referralConfig) {
      return
    }
    setLoadingKey('referral-config')
    setLastError(null)
    setReferralTestResult(null)
    try {
      const payload = await updateReferralConfig(session.access_token, {
        enabled: referralConfig.enabled,
        startAt: referralConfig.startAt || null,
        endAt: referralConfig.endAt || null,
        referrerRewardPoints: referralConfig.referrerRewardPoints,
        refereeRewardPoints: referralConfig.refereeRewardPoints,
        pointsToCurrencyRate: referralConfig.pointsToCurrencyRate,
        minimumOrderValue: referralConfig.minimumOrderValue,
        maxReferralsPerUser: referralConfig.maxReferralsPerUser,
        maxEarningsPerUser: referralConfig.maxEarningsPerUser,
        maxWalletUsagePercent: referralConfig.maxWalletUsagePercent,
        testMode: referralConfig.testMode,
      })
      setReferralConfig(normalizeReferralConfigForForm(payload))
      await loadReferralAdmin()
      setReferralTestResult('Referral configuration updated.')
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleReferralSimulation(mode: 'LINK_SIGNUP' | 'SETTLE_FIRST_ORDER' | 'REVERSE_REWARD') {
    if (!session) {
      return
    }
    const refereeUserId = Number.parseInt(referralRefereeUserId.trim(), 10)
    if (!Number.isFinite(refereeUserId)) {
      setLastError('Enter a valid referee user id.')
      return
    }
    const qualifyingOrderNo = referralOrderNo.trim()
      ? Number.parseInt(referralOrderNo.trim(), 10)
      : undefined
    setLoadingKey(`referral-test-${mode}`)
    setLastError(null)
    setReferralTestResult(null)
    try {
      const response = await runReferralTest(session.access_token, {
        mode,
        refereeUserId,
        referralCode: referralCodeDraft.trim() || undefined,
        deviceId: referralDeviceId.trim() || undefined,
        qualifyingOrderNo,
      })
      setReferralTestResult(response.result)
      await loadReferralAdmin()
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleWalletCredit() {
    if (!session) {
      return
    }
    const userId = Number.parseInt(walletCreditUserId.trim(), 10)
    if (!Number.isFinite(userId)) {
      setLastError('Enter a valid user id for wallet credit.')
      return
    }
    setLoadingKey('wallet-credit')
    setLastError(null)
    setWalletCreditResult(null)
    try {
      const response = await creditReferralWallet(session.access_token, {
        userId,
        pointsAmount: walletCreditPoints.trim(),
        note: walletCreditNote.trim() || undefined,
      })
      setWalletCreditResult(response)
      await loadReferralAdmin()
    } catch (error) {
      setLastError(getErrorMessage(error))
    } finally {
      setLoadingKey(null)
    }
  }

  function openOrderNo(orderNo: number) {
    startTransition(() => {
      setActiveTab('orders')
      setSelectedOrderNo(orderNo)
      setSelectedOrder(null)
    })
  }

  function openOrder(item: AdminOrderListItem) {
    openOrderNo(item.order_no)
  }

  function closeOrderContext() {
    setSelectedOrderNo(null)
    setSelectedOrder(null)
  }

  function openMerchantPayout(summary: AdminMerchantPayoutSummary) {
    startTransition(() => {
      setActiveTab('payouts')
      setSelectedMerchantUid(summary.merchant_uid)
    })
  }

  function handleLogout(message: string | null = null) {
    clearSession()
    setSession(null)
    setLastError(message)
    setDashboard(null)
    setOrderHistory(null)
    setCatalogMerchants([])
    setCatalogAssignments([])
    setCatalogProduct(EMPTY_CATALOG_PRODUCT)
    setAssignmentProductCode('')
    setAssignmentMerchantUid('')
    setCatalogResult(null)
    setOrders(null)
    setSelectedOrder(null)
    setSelectedOrderNo(null)
    setRiders(null)
    setPayouts(null)
    setSelectedMerchantUid(null)
    setSelectedPayout(null)
    setReferralConfig(null)
    setReferralAnalytics(null)
    setReferralList(null)
    setReferralTestResult(null)
    setWalletCreditResult(null)
    setOrderAlert(null)
  }

  const isGoogleRedirectCallback = window.location.pathname === '/auth/callback'

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

          {isGoogleRedirectCallback ? (
            <section className="auth-panel">
              <div className="auth-panel-copy">
                <h2>{loadingKey === 'google-redirect' ? 'Completing Google sign-in' : 'Google sign-in needs another try'}</h2>
                <p>
                  {loadingKey === 'google-redirect'
                    ? 'Securely confirming your administrator access.'
                    : 'The sign-in handoff was not available. Return to the portal and choose Google sign-in again.'}
                </p>
              </div>
              {lastError ? <p className="error-banner">{lastError}</p> : null}
              <button
                className="secondary-button"
                onClick={() => {
                  window.history.replaceState({}, document.title, '/')
                  setLastError(null)
                  setLoadingKey(null)
                  setLoginMode('google')
                }}
              >
                Return to sign-in
              </button>
            </section>
          ) : (
            <>
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
            </>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className={sidebarCollapsed ? 'app-shell sidebar-is-collapsed' : 'app-shell'}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/admin-logo.svg" alt="Cravix Admin" />
          <span className="sidebar-mark" aria-hidden="true">C</span>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <span aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {[
            ['overview', 'Overview'],
            ['catalog', 'Catalog'],
            ['orders', 'Orders'],
            ['history', 'History'],
            ['riders', 'Riders'],
            ['payouts', 'Payouts'],
            ['referrals', 'Referrals'],
            ['dispatch', 'Dispatch'],
            ['errors', 'Errors'],
            ['security', 'Security'],
            ['administrators', 'Administrators'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-pill is-active' : 'nav-pill'}
              onClick={() => setActiveTab(tab as ViewTab)}
              title={label}
            >
              <span className="nav-mark" aria-hidden="true">{label.charAt(0)}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="operator-chip">
            <span className="operator-mark" aria-hidden="true">{(session.display_name ?? 'C').charAt(0)}</span>
            <strong>{session.display_name ?? 'Cravix Admin'}</strong>
            <span>{session.email_address ?? session.mobile_no ?? 'Administrator'}</span>
          </div>
          <button className="ghost-button sign-out-button" onClick={() => handleLogout()} title="Sign out" aria-label="Sign out">
            <LogOut className="sign-out-icon" aria-hidden="true" />
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>

      <section className={activeTab === 'orders' && selectedOrder ? 'workspace workspace-order-context' : 'workspace'}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeTab === 'orders' && selectedOrder ? 'Order workspace' : 'Operations Control'}</p>
            <h1>
              {activeTab === 'overview' && 'Control tower overview'}
              {activeTab === 'catalog' && 'Catalog and merchant setup'}
              {activeTab === 'orders' && (selectedOrder ? `Order #${selectedOrder.order_no}` : 'Order search and intervention')}
              {activeTab === 'history' && 'Completed order history'}
              {activeTab === 'riders' && 'Rider live operations'}
              {activeTab === 'payouts' && 'Merchant payout desk'}
              {activeTab === 'referrals' && 'Referral campaign desk'}
              {activeTab === 'dispatch' && 'Delivery dispatch watch'}
              {activeTab === 'errors' && 'Application error ledger'}
              {activeTab === 'security' && 'Security and login activity'}
              {activeTab === 'administrators' && 'Administrator access'}
            </h1>
          </div>
          <div className="topbar-actions">
            {activeTab === 'orders' && selectedOrderNo !== null ? (
              <button className="back-to-orders" type="button" onClick={closeOrderContext}>
                All orders
              </button>
            ) : null}
            {activeTab === 'overview' || (activeTab === 'orders' && selectedOrderNo === null) || activeTab === 'history' ? (
              <label className="area-selector">
                <span>Area</span>
                <select
                  value={zoneFilter}
                  onChange={(event) => {
                    setOrdersPage(1)
                    setZoneFilter(event.target.value)
                  }}
                >
                  <option value="">All polygons</option>
                  {zoneOptions.map((zone) => (
                    <option key={zone.zone_code ?? zone.zone_name ?? 'zone'} value={zone.zone_code ?? ''}>
                      {zone.zone_name ?? zone.zone_code ?? 'Unknown polygon'}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {dashboard?.generated_at && (activeTab === 'overview' || activeTab === 'orders' || activeTab === 'history') ? (
              <span className="live-indicator" title={`Last updated ${formatDateTime(dashboard.generated_at)}`}>
                Live {formatDateTime(dashboard.generated_at)}
              </span>
            ) : null}
            <span className={`stream-indicator is-${streamStatus}`} title="New orders are delivered through an authenticated live stream; automatic refresh remains enabled as a fallback.">
              {streamStatus === 'live' ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              {streamStatus === 'live' ? 'Alerts live' : 'Reconnecting alerts'}
            </span>
            {activeTab !== 'errors' && activeTab !== 'security' && activeTab !== 'dispatch' && activeTab !== 'administrators' ? (
              <button className="ghost-button refresh-button" onClick={() => void handleManualRefresh()} disabled={isRefreshing}>
                <RefreshCw className={isRefreshing ? 'is-spinning' : undefined} aria-hidden="true" />
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </button>
            ) : null}
          </div>
        </header>

        {lastError ? <p className="error-banner in-app">{lastError}</p> : null}
        {lastManualRefreshAt ? <span className="manual-refresh-status" aria-live="polite">Updated {formatDateTime(lastManualRefreshAt)}</span> : null}
        {orderAlert ? (
          <aside className="new-order-alert" role="alert" aria-live="assertive">
            <BellRing aria-hidden="true" />
            <div>
              <strong>New order #{orderAlert.order_no}</strong>
              <span>{orderAlert.service_zone_name ?? orderAlert.service_zone_code ?? 'Unmapped polygon'} just entered the queue.</span>
            </div>
            <button className="new-order-alert-open" type="button" onClick={() => { openOrderNo(orderAlert.order_no); setOrderAlert(null) }}>
              Open
            </button>
            <button className="new-order-alert-dismiss" type="button" onClick={() => setOrderAlert(null)} aria-label="Dismiss new order alert" title="Dismiss">
              <X aria-hidden="true" />
            </button>
          </aside>
        ) : null}

        {activeTab === 'overview' ? (
          <section className="overview-grid">
            <div className="stats-grid">
              <StatCard label="Orders Today" value={String(dashboard?.orders_today ?? 0)} tone="positive" />
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
                      <MetricChip label="Today" value={String(zone.orders_today)} />
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

        {activeTab === 'history' ? (
          <section className="history-layout">
            <div className="history-toolbar">
              <div>
                <p className="section-kicker">Completed orders</p>
                <h2>{zoneFilter ? 'Selected polygon history' : 'All polygon history'}</h2>
              </div>
              <label>
                Period
                <select value={historyDays} onChange={(event) => setHistoryDays(Number(event.target.value))}>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </label>
            </div>

            <div className="stats-grid history-stats-grid">
              <StatCard label="Completed" value={String(orderHistory?.completed_orders ?? 0)} tone="positive" />
              <StatCard label="Completed Today" value={String(orderHistory?.completed_today ?? 0)} tone="positive" />
              <StatCard label="Collected" value={formatMoney(orderHistory?.gross_revenue)} tone="neutral" />
              <StatCard label="Average Order" value={formatMoney(orderHistory?.average_order_value)} tone="neutral" />
              <StatCard label="Average Fulfillment" value={orderHistory?.average_fulfillment_minutes === null || orderHistory?.average_fulfillment_minutes === undefined ? 'Not available' : `${orderHistory.average_fulfillment_minutes} min`} tone="warning" />
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Daily completion</p>
                  <h2>Delivery performance over {orderHistory?.period_days ?? historyDays} days</h2>
                </div>
              </div>
              <div className="history-chart" aria-label="Completed orders by day">
                {(orderHistory?.daily ?? []).map((day) => (
                  <div className="history-bar-column" key={day.date} title={`${day.date}: ${day.completed_orders} completed orders`}>
                    <strong>{day.completed_orders}</strong>
                    <div className="history-bar-track">
                      <div className="history-bar" style={{ height: `${Math.max(5, Math.round((day.completed_orders / historyMaxOrders) * 100))}%` }} />
                    </div>
                    <span>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${day.date}T00:00:00`))}</span>
                  </div>
                ))}
              </div>
              {orderHistory?.daily.every((day) => day.completed_orders === 0) ? <EmptyState title="No completed orders yet" body="Completed delivery trends will appear here as orders are fulfilled." /> : null}
            </section>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">History queue</p>
                  <h2>Most recently completed orders</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Completed</th>
                      <th>Polygon</th>
                      <th>Merchants</th>
                      <th>Rider</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orderHistory?.recent_completed_orders ?? []).map((item) => (
                      <tr key={item.order_no} onClick={() => openOrder(item)}>
                        <td><strong>#{item.order_no}</strong><span>{item.customer_name ?? 'Guest'}</span></td>
                        <td>{formatDateTime(item.completed_at)}</td>
                        <td>{item.service_zone_name ?? item.service_zone_code ?? 'No polygon'}</td>
                        <td>{item.merchant_names.join(', ') || 'Unassigned'}</td>
                        <td>{item.rider_names.join(', ') || 'Not assigned'}</td>
                        <td>{formatMoney(item.payment_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {orderHistory?.recent_completed_orders.length === 0 ? <EmptyState title="No completed orders" body="Once an order is delivered, it will appear here with its fulfillment history." /> : null}
            </section>
          </section>
        ) : null}

        {activeTab === 'errors' ? (
          <ObservabilityView mode="errors" token={session.access_token} />
        ) : null}

        {activeTab === 'security' ? (
          <ObservabilityView mode="security" token={session.access_token} />
        ) : null}

        {activeTab === 'dispatch' ? (
          <DispatchView token={session.access_token} />
        ) : null}

        {activeTab === 'administrators' ? (
          <AdministratorsView token={session.access_token} />
        ) : null}

        {activeTab === 'catalog' ? (
          <section className="catalog-setup-grid">
            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Product</p>
                  <h2>Create a sellable catalog item</h2>
                </div>
              </div>
              <form className="catalog-form" onSubmit={(event) => { event.preventDefault(); void handleCreateCatalogProduct() }}>
                <div className="inline-grid">
                  <label>
                    Product code
                    <input value={catalogProduct.productCode} onChange={(event) => setCatalogProduct((current) => ({ ...current, productCode: event.target.value.toUpperCase() }))} placeholder="PGRMEAL01" maxLength={40} />
                  </label>
                  <label>
                    Price
                    <input value={catalogProduct.price} onChange={(event) => setCatalogProduct((current) => ({ ...current, price: event.target.value }))} type="number" min="0.01" step="0.01" placeholder="149.00" />
                  </label>
                </div>
                <label>
                  Product name
                  <input value={catalogProduct.productName} onChange={(event) => setCatalogProduct((current) => ({ ...current, productName: event.target.value }))} placeholder="Paneer rice bowl" maxLength={160} />
                </label>
                <label>
                  Category
                  <input value={catalogProduct.categoryName} onChange={(event) => setCatalogProduct((current) => ({ ...current, categoryName: event.target.value }))} placeholder="Rice bowls" maxLength={120} />
                </label>
                <label>
                  Image URL
                  <input value={catalogProduct.imageUrl} onChange={(event) => setCatalogProduct((current) => ({ ...current, imageUrl: event.target.value }))} type="url" placeholder="https://..." />
                </label>
                <label>
                  Description
                  <textarea value={catalogProduct.description} onChange={(event) => setCatalogProduct((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Ingredients, portion, and customer-facing details" />
                </label>
                <button className="primary-button" type="submit" disabled={loadingKey === 'catalog-product'}>
                  {loadingKey === 'catalog-product' ? 'Creating...' : 'Create product'}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Availability</p>
                  <h2>Assign a product to a merchant</h2>
                </div>
              </div>
              <form className="catalog-form" onSubmit={(event) => { event.preventDefault(); void handleAssignProduct() }}>
                <label>
                  Product code
                  <input value={assignmentProductCode} onChange={(event) => setAssignmentProductCode(event.target.value.toUpperCase())} placeholder="PGRMEAL01" maxLength={40} />
                </label>
                <label>
                  Merchant
                  <select value={assignmentMerchantUid} onChange={(event) => setAssignmentMerchantUid(event.target.value)}>
                    <option value="">Select merchant</option>
                    {catalogMerchants.map((merchant) => (
                      <option key={merchant.merchant_uid} value={merchant.merchant_uid}>
                        {merchant.display_name} · {merchant.location_label ?? merchant.kitchen_type} · {merchant.coverage_zone_codes.length > 0 ? merchant.coverage_zone_codes.join(', ') : 'NO COVERAGE'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preparation time (minutes)
                  <input value={assignmentPrepMinutes} onChange={(event) => setAssignmentPrepMinutes(event.target.value)} type="number" min="1" max="180" />
                </label>
                <button className="primary-button" type="submit" disabled={loadingKey === 'catalog-assignment' || catalogMerchants.length === 0}>
                  {loadingKey === 'catalog-assignment' ? 'Assigning...' : 'Assign and activate'}
                </button>
              </form>
            </section>

            {catalogResult ? <p className="success-banner">{catalogResult}</p> : null}

            <section className="panel catalog-assignment-panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Current Setup</p>
                  <h2>Product-to-merchant assignments</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Merchant</th>
                      <th>Prep time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogAssignments.map((assignment) => (
                      <tr key={`${assignment.product_code}-${assignment.merchant_uid}`}>
                        <td><strong>{assignment.product_code}</strong></td>
                        <td>{assignment.merchant_name}</td>
                        <td>{assignment.prep_time_minutes} minutes</td>
                        <td><span className={`badge ${assignment.active_yn === 'Y' ? 'is-positive' : 'is-neutral'}`}>{assignment.active_yn === 'Y' ? 'ACTIVE' : 'PAUSED'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {catalogAssignments.length === 0 ? <EmptyState title="No assignments" body="Create a product and assign it to an active merchant." /> : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeTab === 'orders' ? (
          selectedOrder ? (
            <section className="order-workspace">
              <section className="order-summary-card">
                <div className="order-summary-heading">
                  <div className="order-summary-title">
                    <span className="section-icon section-icon--order" aria-hidden="true"><ShoppingBag /></span>
                    <div>
                      <p className="section-kicker">Live fulfillment</p>
                      <h2>Order brief</h2>
                    </div>
                  </div>
                  {primaryOrderIssue ? (
                    <span className="badge is-danger"><CircleAlert aria-hidden="true" /> {formatRelativeStatus(primaryOrderIssue)}</span>
                  ) : (
                    <span className={`badge ${badgeTone(selectedOrder.order_status)}`}>{selectedOrder.order_status}</span>
                  )}
                </div>
                <div className="order-summary-facts">
                  <div className="order-summary-fact is-customer">
                    <span className="fact-icon" aria-hidden="true"><UserRound /></span>
                    <div>
                      <span>Customer</span>
                      <strong>{selectedOrder.customer.name ?? 'Unknown customer'}</strong>
                      {selectedOrder.customer.mobile_no ? <ContactAction label="customer" mobileNo={selectedOrder.customer.mobile_no} /> : <small>No phone saved</small>}
                    </div>
                  </div>
                  <div className="order-summary-fact is-delivery">
                    <span className="fact-icon" aria-hidden="true"><MapPin /></span>
                    <div>
                      <span>Delivery</span>
                      <strong>{selectedOrder.delivery.full_address ?? 'No address'}</strong>
                      <small>{selectedOrder.delivery.service_zone_name ?? selectedOrder.delivery.service_zone_code ?? 'No zone'}</small>
                    </div>
                  </div>
                  <div className="order-summary-fact is-payment">
                    <span className="fact-icon" aria-hidden="true"><CreditCard /></span>
                    <div>
                      <span>Payment</span>
                      <strong>{selectedOrder.payment.payment_status ?? 'No payment'}</strong>
                      <small>{formatMoney(selectedOrder.payment.payment_amount)}</small>
                    </div>
                  </div>
                  <div className="order-summary-fact is-placed">
                    <span className="fact-icon" aria-hidden="true"><Clock3 /></span>
                    <div>
                      <span>Placed</span>
                      <strong>{formatDateTime(selectedOrder.order_placed_on)}</strong>
                      <small>{primaryOrderIssue ? 'Operator attention needed' : 'No active issues'}</small>
                    </div>
                  </div>
                </div>
              </section>

              <OrderJourney order={selectedOrder} />

              <section className={selectedOrder.fulfillment_groups.length > 1 ? 'order-operations-grid' : 'order-operations-grid is-single-focus'}>
                <article className={selectedOrderRider ? 'order-priority-card rider-priority-card is-assigned' : 'order-priority-card rider-priority-card is-unassigned'}>
                  <div className="order-priority-heading">
                    <div className="priority-title">
                      <span className="section-icon section-icon--rider" aria-hidden="true"><Bike /></span>
                      <div>
                        <p className="section-kicker">Rider dispatch</p>
                        <h2>{selectedOrderRider?.display_name ?? 'Rider needed'}</h2>
                      </div>
                    </div>
                    {selectedOrderRider ? <span className={`badge ${badgeTone(selectedOrderRider.availability_status)}`}>{selectedOrderRider.availability_status}</span> : null}
                  </div>
                  {selectedOrderRider ? (
                    <div className="rider-priority-details">
                      <p>{selectedOrderRider.location_updated_at ? `Location updated ${formatDateTime(selectedOrderRider.location_updated_at)}` : 'Live location not reported yet'}</p>
                      <div className="priority-actions">
                        <ContactAction label={selectedOrderRider.display_name} mobileNo={selectedOrderRider.mobile_no} />
                        {selectedOrderRider.latitude !== null && selectedOrderRider.longitude !== null ? (
                          <a className="maps-link" href={`https://maps.google.com/?q=${selectedOrderRider.latitude},${selectedOrderRider.longitude}`} target="_blank" rel="noreferrer">
                            Open live location
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="dispatch-callout">
                      <CircleAlert aria-hidden="true" />
                      <p>Assign a nearby live rider from the fulfillment action below to move this order to pickup.</p>
                    </div>
                  )}
                </article>

                {selectedOrder.fulfillment_groups.length > 1 ? (
                  <article className="order-priority-card kitchen-priority-card">
                    <div className="order-priority-heading">
                      <div className="priority-title">
                        <span className="section-icon section-icon--kitchen" aria-hidden="true"><ChefHat /></span>
                        <div>
                          <p className="section-kicker">Kitchen coordination</p>
                          <h2>{selectedOrder.fulfillment_groups.length} kitchens in this order</h2>
                        </div>
                      </div>
                    </div>
                    <div className="kitchen-priority-list">
                      {selectedOrder.fulfillment_groups.map((group) => (
                        <div key={group.wo_no}>
                          <strong>{group.merchant?.display_name ?? 'Unassigned merchant'}</strong>
                          <span>{group.estimated_prep_minutes ? `${group.estimated_prep_minutes} min prep` : 'Prep time not set'}</span>
                          <span className={`badge ${badgeTone(group.order_status)}`}>{group.order_status}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </section>

              <section className="fulfillment-stack order-fulfillment-stack">
                {selectedOrder.fulfillment_groups.map((group) => (
                  <article key={group.wo_no} className="fulfillment-card">
                    <div className="fulfillment-head">
                      <div className="fulfillment-title">
                        <span className="section-icon section-icon--kitchen" aria-hidden="true"><ChefHat /></span>
                        <div>
                          <p className="section-kicker">Fulfillment #{group.wo_no}</p>
                          <h3>{group.merchant?.display_name ?? 'Unassigned merchant'}</h3>
                          <p>{group.merchant?.location_label ?? 'No merchant location label'}</p>
                          {group.merchant ? <ContactAction label={group.merchant.display_name} mobileNo={group.merchant.mobile_no} /> : null}
                        </div>
                      </div>
                      <div className="status-cluster">
                        <span className={`badge ${badgeTone(group.order_status)}`}>{group.order_status}</span>
                      </div>
                    </div>

                    <div className="fulfillment-meta">
                      <span>Subtotal <strong>{formatMoney(group.subtotal_amount)}</strong></span>
                      <span>Preparation <strong>{group.estimated_prep_minutes ? `${group.estimated_prep_minutes} min` : 'Not set'}</strong></span>
                      <span>Assigned rider <strong>{group.rider?.display_name ?? 'Not assigned'}</strong></span>
                    </div>

                    <div className="kitchen-timeline">
                      {group.timeline.map((step) => (
                        <div key={`${group.wo_no}-${step.label}`} className="kitchen-timeline-step">
                          <JourneyMarker label={step.label} status={step.status} />
                          <strong>{step.label}</strong>
                          <small>{formatDateTime(step.timestamp)}</small>
                        </div>
                      ))}
                    </div>

                    <section className="fulfillment-items">
                      <div className="fulfillment-items-head">
                        <div><Package aria-hidden="true" /><strong>Items to pack</strong></div>
                        <span>{group.items.length} {group.items.length === 1 ? 'item' : 'items'}</span>
                      </div>
                      <div className="item-list">
                        {group.items.map((item) => (
                          <div key={`${group.wo_no}-${item.item_no}`} className="item-row">
                            <div className="item-copy">
                              <strong>{item.product_name}</strong>
                              <span>{item.product_code}</span>
                            </div>
                            <strong>x {item.quantity}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="action-row fulfillment-actions">
                      <label className="rider-assignment">
                        <span><Bike aria-hidden="true" /> Rider assignment</span>
                        <select
                          value={assignmentDrafts[group.wo_no] ?? ''}
                          onChange={(event) =>
                            setAssignmentDrafts((current) => ({
                              ...current,
                              [group.wo_no]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select a live rider</option>
                          {liveRiders.map((rider) => (
                            <option key={rider.rider_uid} value={String(rider.rider_uid)}>
                              {rider.display_name}
                            </option>
                          ))}
                        </select>
                      </label>
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
              </section>
            </section>
          ) : (
            <section className="orders-browser panel">
              <div className="orders-browser-header">
                <div>
                  <p className="section-kicker">Orders</p>
                  <h2>Search and open an order workspace</h2>
                </div>
                <span>{orders?.total ?? 0} matching orders</span>
              </div>
              <div className="filter-grid orders-filter-grid">
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
              <div className="orders-grid">
                {(orders?.items ?? []).map((item) => (
                  <button key={item.order_no} className="order-browser-card" onClick={() => openOrder(item)}>
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
                      <strong>{formatMoney(item.payment_amount)}</strong>
                    </div>
                    <div className="tag-row">
                      {item.merchant_names.slice(0, 2).map((merchant) => (
                        <span key={merchant} className="tiny-flag">{merchant}</span>
                      ))}
                      {item.issue_flags.map((flag) => (
                        <span key={flag} className="tiny-flag warning">{formatRelativeStatus(flag)}</span>
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
          )
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

        {activeTab === 'referrals' ? (
          <section className="split-layout">
            <section className="panel detail-panel">
              <div className="panel-head">
                <div>
                  <p className="section-kicker">Campaign</p>
                  <h2>Referral rewards and wallet rules</h2>
                </div>
              </div>

              <div className="stats-grid">
                <StatCard label="Referrals Sent" value={String(referralAnalytics?.totalReferralsSent ?? 0)} tone="warning" />
                <StatCard label="Signed Up" value={String(referralAnalytics?.totalSignedUp ?? 0)} tone="neutral" />
                <StatCard label="Successful" value={String(referralAnalytics?.successfulConversions ?? 0)} tone="positive" />
                <StatCard label="Revenue" value={formatMoney(referralAnalytics?.referredRevenue)} tone="warning" />
                <StatCard label="Rewards Distributed" value={formatMoney(referralAnalytics?.totalRewardsDistributed)} tone="positive" />
                <StatCard label="Pending Rewards" value={formatMoney(referralAnalytics?.pendingRewardsAmount)} tone="neutral" />
              </div>

              {referralConfig ? (
                <div className="referral-admin-grid">
                  <div className="settlement-box">
                    <div className="panel-head compact">
                      <div>
                        <p className="section-kicker">Config</p>
                        <h2>Launch controls</h2>
                      </div>
                    </div>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={referralConfig.enabled}
                        onChange={(event) =>
                          setReferralConfig((current) => (current ? { ...current, enabled: event.target.checked } : current))
                        }
                      />
                      <span>Referral campaign enabled</span>
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={referralConfig.testMode}
                        onChange={(event) =>
                          setReferralConfig((current) => (current ? { ...current, testMode: event.target.checked } : current))
                        }
                      />
                      <span>Test mode enabled</span>
                    </label>
                    <div className="inline-grid">
                      <label>
                        Campaign start
                        <input
                          type="datetime-local"
                          value={referralConfig.startAt ?? ''}
                          onChange={(event) =>
                            setReferralConfig((current) => (current ? { ...current, startAt: event.target.value || null } : current))
                          }
                        />
                      </label>
                      <label>
                        Campaign end
                        <input
                          type="datetime-local"
                          value={referralConfig.endAt ?? ''}
                          onChange={(event) =>
                            setReferralConfig((current) => (current ? { ...current, endAt: event.target.value || null } : current))
                          }
                        />
                      </label>
                      <label>
                        Referrer reward points
                        <input
                          value={referralConfig.referrerRewardPoints}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, referrerRewardPoints: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Referee reward points
                        <input
                          value={referralConfig.refereeRewardPoints}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, refereeRewardPoints: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Points to INR rate
                        <input
                          value={referralConfig.pointsToCurrencyRate}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, pointsToCurrencyRate: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Minimum first order
                        <input
                          value={referralConfig.minimumOrderValue}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, minimumOrderValue: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Max referrals per user
                        <input
                          type="number"
                          min={0}
                          value={referralConfig.maxReferralsPerUser}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, maxReferralsPerUser: Number.parseInt(event.target.value || '0', 10) || 0 } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Max earnings per user
                        <input
                          value={referralConfig.maxEarningsPerUser}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, maxEarningsPerUser: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                      <label>
                        Max wallet usage %
                        <input
                          value={referralConfig.maxWalletUsagePercent}
                          onChange={(event) =>
                            setReferralConfig((current) =>
                              current ? { ...current, maxWalletUsagePercent: event.target.value } : current,
                            )
                          }
                        />
                      </label>
                    </div>
                    <button className="primary-button" onClick={() => void handleSaveReferralConfig()} disabled={loadingKey === 'referral-config'}>
                      {loadingKey === 'referral-config' ? 'Saving...' : 'Save referral settings'}
                    </button>
                  </div>

                  <div className="settlement-box">
                    <div className="panel-head compact">
                      <div>
                        <p className="section-kicker">Test Mode</p>
                        <h2>Simulate and credit</h2>
                      </div>
                    </div>
                    <div className="inline-grid">
                      <label>
                        Referee user id
                        <input value={referralRefereeUserId} onChange={(event) => setReferralRefereeUserId(event.target.value)} placeholder="102" />
                      </label>
                      <label>
                        Referral code
                        <input value={referralCodeDraft} onChange={(event) => setReferralCodeDraft(event.target.value)} placeholder="ABCD1234" />
                      </label>
                      <label>
                        Device id
                        <input value={referralDeviceId} onChange={(event) => setReferralDeviceId(event.target.value)} placeholder="test-device-01" />
                      </label>
                      <label>
                        Qualifying order no
                        <input value={referralOrderNo} onChange={(event) => setReferralOrderNo(event.target.value)} placeholder="401" />
                      </label>
                    </div>
                    <div className="topbar-actions">
                      <button className="ghost-button" onClick={() => void handleReferralSimulation('LINK_SIGNUP')} disabled={loadingKey === 'referral-test-LINK_SIGNUP'}>
                        {loadingKey === 'referral-test-LINK_SIGNUP' ? 'Linking...' : 'Simulate signup'}
                      </button>
                      <button className="ghost-button" onClick={() => void handleReferralSimulation('SETTLE_FIRST_ORDER')} disabled={loadingKey === 'referral-test-SETTLE_FIRST_ORDER'}>
                        {loadingKey === 'referral-test-SETTLE_FIRST_ORDER' ? 'Settling...' : 'Simulate first order'}
                      </button>
                      <button className="secondary-button" onClick={() => void handleReferralSimulation('REVERSE_REWARD')} disabled={loadingKey === 'referral-test-REVERSE_REWARD'}>
                        {loadingKey === 'referral-test-REVERSE_REWARD' ? 'Reversing...' : 'Reverse reward'}
                      </button>
                    </div>
                    <div className="inline-grid">
                      <label>
                        Wallet credit user id
                        <input value={walletCreditUserId} onChange={(event) => setWalletCreditUserId(event.target.value)} placeholder="102" />
                      </label>
                      <label>
                        Points amount
                        <input value={walletCreditPoints} onChange={(event) => setWalletCreditPoints(event.target.value)} placeholder="50" />
                      </label>
                    </div>
                    <label>
                      Wallet credit note
                      <textarea value={walletCreditNote} onChange={(event) => setWalletCreditNote(event.target.value)} rows={3} />
                    </label>
                    <button className="primary-button" onClick={() => void handleWalletCredit()} disabled={loadingKey === 'wallet-credit'}>
                      {loadingKey === 'wallet-credit' ? 'Crediting...' : 'Credit test wallet'}
                    </button>
                    {referralTestResult ? <p className="muted-line">{referralTestResult}</p> : null}
                    {walletCreditResult ? (
                      <p className="muted-line">
                        {walletCreditResult.result} • Balance {formatMoney(walletCreditResult.walletAmount)} • {walletCreditResult.totalPoints} points
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <EmptyState title="Referral config unavailable" body="Refresh the page once the backend referral endpoints are reachable." />
              )}
            </section>

            <section className="panel list-panel">
              <div className="panel-head compact">
                <div>
                  <p className="section-kicker">Referrals</p>
                  <h2>Conversion and reward queue</h2>
                </div>
              </div>
              <div className="filter-grid filter-grid--triple">
                <label>
                  Search
                  <input
                    value={referralQuery}
                    onChange={(event) => {
                      setReferralPage(1)
                      setReferralQuery(event.target.value)
                    }}
                    placeholder="Referrer, referee, email, code"
                  />
                </label>
                <label>
                  Status
                  <select
                    value={referralStatus}
                    onChange={(event) => {
                      setReferralPage(1)
                      setReferralStatus(event.target.value)
                    }}
                  >
                    <option value="">All statuses</option>
                    <option value="INVITED">Invited</option>
                    <option value="SIGNED_UP">Signed up</option>
                    <option value="FIRST_ORDER_DONE">First order done</option>
                    <option value="REVERSED">Reversed</option>
                  </select>
                </label>
                <label>
                  Reward
                  <select
                    value={referralRewardStatus}
                    onChange={(event) => {
                      setReferralPage(1)
                      setReferralRewardStatus(event.target.value)
                    }}
                  >
                    <option value="">All rewards</option>
                    <option value="PENDING">Pending</option>
                    <option value="CREDITED">Credited</option>
                    <option value="REVERSED">Reversed</option>
                  </select>
                </label>
              </div>
              <div className="order-stack">
                {(referralList?.items ?? []).map((item) => (
                  <article key={item.id} className="list-card referral-row-card">
                    <div className="list-card-top">
                      <div>
                        <strong>{item.referrerName ?? 'Unknown referrer'}</strong>
                        <span>{item.referrerEmail ?? item.referralCode}</span>
                      </div>
                      <span className={`badge ${badgeTone(item.rewardStatus)}`}>{item.rewardStatus}</span>
                    </div>
                    <p>{item.refereeName ?? item.refereeMobile ?? 'Referee still pending profile details'}</p>
                    <div className="meta-row">
                      <span>{item.status.replaceAll('_', ' ')}</span>
                      <span>
                        {formatMoney(item.referrerRewardAmount)} + {formatMoney(item.refereeRewardAmount)}
                      </span>
                    </div>
                    <div className="tag-row">
                      <span className="tiny-flag">{item.referralCode}</span>
                      {item.qualifyingOrderNo ? <span className="tiny-flag">Order #{item.qualifyingOrderNo}</span> : null}
                      {item.rejectionReason ? <span className="tiny-flag warning">{item.rejectionReason}</span> : null}
                    </div>
                    <small>
                      Invited {formatDateTime(item.createdAt)}{item.rewardedAt ? ` • Rewarded ${formatDateTime(item.rewardedAt)}` : ''}
                    </small>
                  </article>
                ))}
                {referralList?.items.length === 0 ? <EmptyState title="No referral relationships" body="Try clearing the filters or simulate one in test mode." /> : null}
              </div>
              <PaginationBar
                page={referralList?.page ?? referralPage}
                total={referralList?.total ?? 0}
                pageSize={referralList?.pageSize ?? 20}
                onPrevious={() => setReferralPage((current) => Math.max(1, current - 1))}
                onNext={() => setReferralPage((current) => current + 1)}
              />
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
