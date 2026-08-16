import type {
  AdminDashboard,
  AdminOrderHistory,
  AdminCatalogProduct,
  DispatchIncident,
  DispatchIncidentResult,
  AdminMerchantProfile,
  AdminMerchantPayoutDetail,
  AdminMerchantPayoutSummaryResult,
  AdminOrderDetail,
  AdminOrderCreatedEvent,
  AdminOrderSearchResult,
  OperationalEventResult,
  ObservabilitySummary,
  AdminReferralAnalytics,
  AdminReferralConfig,
  AdminReferralListResult,
  AdminRiderListResult,
  AdminSession,
  AdminProductMerchantAssignment,
  AdminAdministrator,
  AdminAdministratorResult,
  AdminWalletCreditResponse,
} from './types'

const PRODUCTION_ADMIN_ORIGIN = 'https://admin.cravix.co.in'
const PRODUCTION_API_BASE_URL = 'https://api.cravix.co.in/api/v1'
const DEFAULT_API_BASE_URL = 'https://easy-subscription-python-api-production.up.railway.app/api/v1'
const DEFAULT_GOOGLE_CLIENT_ID = '448494748748-hiu2s00n0fkegd8p23n3g2tuaihqjfdi.apps.googleusercontent.com'
const configuredApiBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim()
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.origin === PRODUCTION_ADMIN_ORIGIN
    ? PRODUCTION_API_BASE_URL
    : configuredApiBaseUrl || DEFAULT_API_BASE_URL

export const appConfig = {
  apiBaseUrl: API_BASE_URL,
  googleClientId: ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim() || DEFAULT_GOOGLE_CLIENT_ID,
  allowMockGoogle: ((import.meta.env.VITE_ALLOW_MOCK_GOOGLE as string | undefined) ?? 'false').trim() === 'true',
  dashboardPollIntervalMs: 15000,
}

export class ApiError extends Error {
  readonly status: number
  readonly requestId: string | null

  constructor(message: string, status: number, requestId: string | null = null) {
    super(message)
    this.status = status
    this.requestId = requestId
  }
}

let reportingClientError = false
const recentClientErrors = new Map<string, number>()
const fallbackInstallationId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`

function clientCountry(): string | undefined {
  const region = navigator.language.split('-')[1]?.toUpperCase()
  return region?.length === 2 ? region : undefined
}

function installationId(): string {
  const key = 'cravix.admin.installation-id'
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const generated = window.crypto.randomUUID()
    window.localStorage.setItem(key, generated)
    return generated
  } catch {
    return fallbackInstallationId
  }
}

function sanitizedClientMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(authorization|password|passwd|otp|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    )
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500)
}

function diagnosticBlob(error: unknown): Record<string, string> | undefined {
  if (!(error instanceof Error)) return undefined
  const stackTrace = error.stack
    ?.replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, 6000)
  return {
    error_name: error.name.slice(0, 120),
    ...(stackTrace ? { stack_trace: stackTrace } : {}),
  }
}

export async function reportAdminClientError(
  flow: string,
  error: unknown,
  token?: string,
): Promise<void> {
  if (reportingClientError) return
  const message = sanitizedClientMessage(error)
  const status = error instanceof ApiError ? error.status : undefined
  const requestId = error instanceof ApiError ? error.requestId : null
  const dedupeKey = `${flow}|${status ?? ''}|${message}`
  const now = Date.now()
  if (now - (recentClientErrors.get(dedupeKey) ?? 0) < 5000) return
  recentClientErrors.set(dedupeKey, now)
  reportingClientError = true
  try {
    const country = clientCountry()
    await fetch(`${API_BASE_URL}/telemetry/client-errors`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(country ? { 'X-Client-Country': country } : {}),
      },
      body: JSON.stringify({
        source: 'ADMIN_PWA',
        flow: flow.replace(/[\r\n]+/g, ' ').slice(0, 80),
        message,
        error_code: status ? `http_${status}` : 'admin_client_error',
        status_code: status,
        request_id: requestId,
        occurred_at: new Date().toISOString(),
        platform: 'WEB',
        app_version: String(import.meta.env.VITE_APP_VERSION ?? 'unknown'),
        installation_id: installationId(),
        exception_type: error instanceof Error ? error.name.slice(0, 120) : undefined,
        exception_blob: diagnosticBlob(error),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Admin diagnostics must not hide or replace the original failure.
  } finally {
    reportingClientError = false
  }
}

function pickValue<T>(payload: Record<string, unknown>, camelKey: string, snakeKey: string): T | undefined {
  if (camelKey in payload) {
    return payload[camelKey] as T
  }
  if (snakeKey in payload) {
    return payload[snakeKey] as T
  }
  return undefined
}

function normalizeReferralConfig(payload: Record<string, unknown>): AdminReferralConfig {
  return {
    enabled: Boolean(payload.enabled),
    startAt: pickValue<string | null>(payload, 'startAt', 'start_at') ?? null,
    endAt: pickValue<string | null>(payload, 'endAt', 'end_at') ?? null,
    referrerRewardPoints: String(
      pickValue<string | number>(payload, 'referrerRewardPoints', 'referrer_reward_points') ?? '0',
    ),
    referrerRewardAmount: String(
      pickValue<string | number>(payload, 'referrerRewardAmount', 'referrer_reward_amount') ?? '0',
    ),
    refereeRewardPoints: String(
      pickValue<string | number>(payload, 'refereeRewardPoints', 'referee_reward_points') ?? '0',
    ),
    refereeRewardAmount: String(
      pickValue<string | number>(payload, 'refereeRewardAmount', 'referee_reward_amount') ?? '0',
    ),
    pointsToCurrencyRate: String(
      pickValue<string | number>(payload, 'pointsToCurrencyRate', 'points_to_currency_rate') ?? '1',
    ),
    minimumOrderValue: String(
      pickValue<string | number>(payload, 'minimumOrderValue', 'minimum_order_value') ?? '0',
    ),
    maxReferralsPerUser: Number(
      pickValue<number | string>(payload, 'maxReferralsPerUser', 'max_referrals_per_user') ?? 0,
    ),
    maxEarningsPerUser: String(
      pickValue<string | number>(payload, 'maxEarningsPerUser', 'max_earnings_per_user') ?? '0',
    ),
    maxWalletUsagePercent: String(
      pickValue<string | number>(payload, 'maxWalletUsagePercent', 'max_wallet_usage_percent') ?? '0',
    ),
    testMode: Boolean(pickValue<boolean>(payload, 'testMode', 'test_mode')),
  }
}

function normalizeReferralAnalytics(payload: Record<string, unknown>): AdminReferralAnalytics {
  return {
    totalReferralsSent: Number(
      pickValue<number | string>(payload, 'totalReferralsSent', 'total_referrals_sent') ?? 0,
    ),
    totalSignedUp: Number(
      pickValue<number | string>(payload, 'totalSignedUp', 'total_signed_up') ?? 0,
    ),
    successfulConversions: Number(
      pickValue<number | string>(payload, 'successfulConversions', 'successful_conversions') ?? 0,
    ),
    referredRevenue: String(
      pickValue<string | number>(payload, 'referredRevenue', 'referred_revenue') ?? '0',
    ),
    totalRewardsDistributed: String(
      pickValue<string | number>(payload, 'totalRewardsDistributed', 'total_rewards_distributed') ?? '0',
    ),
    pendingRewardsAmount: String(
      pickValue<string | number>(payload, 'pendingRewardsAmount', 'pending_rewards_amount') ?? '0',
    ),
  }
}

function normalizeReferralList(payload: Record<string, unknown>): AdminReferralListResult {
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  return {
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? 1),
    pageSize: Number(pickValue<number | string>(payload, 'pageSize', 'page_size') ?? 20),
    items: rawItems.map((entry) => {
      const item = entry as Record<string, unknown>
      return {
        id: Number(item.id ?? 0),
        referrerName: pickValue<string | null>(item, 'referrerName', 'referrer_name') ?? null,
        referrerEmail: pickValue<string | null>(item, 'referrerEmail', 'referrer_email') ?? null,
        referralCode: String(pickValue<string>(item, 'referralCode', 'referral_code') ?? ''),
        refereeName: pickValue<string | null>(item, 'refereeName', 'referee_name') ?? null,
        refereeMobile: pickValue<string | null>(item, 'refereeMobile', 'referee_mobile') ?? null,
        status: String(item.status ?? ''),
        rewardStatus: String(pickValue<string>(item, 'rewardStatus', 'reward_status') ?? ''),
        qualifyingOrderNo:
          pickValue<number | null>(item, 'qualifyingOrderNo', 'qualifying_order_no') ?? null,
        referrerRewardAmount: String(
          pickValue<string | number>(item, 'referrerRewardAmount', 'referrer_reward_amount') ?? '0',
        ),
        refereeRewardAmount: String(
          pickValue<string | number>(item, 'refereeRewardAmount', 'referee_reward_amount') ?? '0',
        ),
        createdAt: pickValue<string | null>(item, 'createdAt', 'created_at') ?? null,
        qualifiedAt: pickValue<string | null>(item, 'qualifiedAt', 'qualified_at') ?? null,
        rewardedAt: pickValue<string | null>(item, 'rewardedAt', 'rewarded_at') ?? null,
        rejectionReason: pickValue<string | null>(item, 'rejectionReason', 'rejection_reason') ?? null,
      }
    }),
  }
}

function normalizeWalletCreditResponse(payload: Record<string, unknown>): AdminWalletCreditResponse {
  return {
    result: String(payload.result ?? ''),
    walletAmount: String(pickValue<string | number>(payload, 'walletAmount', 'wallet_amount') ?? '0'),
    totalPoints: String(pickValue<string | number>(payload, 'totalPoints', 'total_points') ?? '0'),
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  token?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
  credentials?: RequestCredentials
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`)
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const country = clientCountry()
  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(country ? { 'X-Client-Country': country } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: options.credentials ?? 'same-origin',
      signal: AbortSignal.timeout(20000),
    })
  } catch (error) {
    const networkError = new ApiError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'The API request timed out.'
        : 'Unable to reach the API.',
      0,
    )
    if (path !== '/telemetry/client-errors') {
      void reportAdminClientError(`${options.method ?? 'GET'} ${path}`, networkError, options.token)
    }
    throw networkError
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? 'Request failed')
        : `Request failed with status ${response.status}`
    const error = new ApiError(message, response.status, response.headers.get('x-request-id'))
    if (path !== '/telemetry/client-errors') {
      void reportAdminClientError(`${options.method ?? 'GET'} ${path}`, error, options.token)
    }
    throw error
  }
  return payload as T
}

type AdminOrderStreamStatus = 'connecting' | 'live' | 'reconnecting'

type AdminOrderStreamOptions = {
  token: string
  zoneCode?: string
  onOrderCreated: (event: AdminOrderCreatedEvent) => void
  onStatusChange: (status: AdminOrderStreamStatus) => void
  onAuthenticationExpired: () => void
}

function parseSseFrame(frame: string): { event: string; id: string | null; data: string } | null {
  let event = 'message'
  let id: string | null = null
  const data: string[] = []

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    const value = (separator === -1 ? '' : line.slice(separator + 1)).replace(/^ /, '')
    if (field === 'event') event = value
    if (field === 'id') id = value
    if (field === 'data') data.push(value)
  }

  return data.length > 0 ? { event, id, data: data.join('\n') } : null
}

function normalizeNewOrderEvent(payload: unknown): AdminOrderCreatedEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const orderNo = Number(record.order_no)
  if (!Number.isSafeInteger(orderNo) || orderNo < 1) return null
  return {
    order_no: orderNo,
    service_zone_code: typeof record.service_zone_code === 'string' ? record.service_zone_code : null,
    service_zone_name: typeof record.service_zone_name === 'string' ? record.service_zone_name : null,
    order_placed_on: typeof record.order_placed_on === 'string' ? record.order_placed_on : null,
  }
}

/**
 * Opens a bearer-authenticated SSE connection. Native EventSource cannot attach
 * an Authorization header, so fetch keeps the token out of query strings and
 * still consumes the standard text/event-stream protocol.
 */
export function connectAdminOrderStream(options: AdminOrderStreamOptions): () => void {
  const controller = new AbortController()
  let stopped = false
  let lastEventId: string | null = null

  const pause = (milliseconds: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, milliseconds)
    })

  const readConnection = async () => {
    const url = new URL(`${API_BASE_URL}/admin/orders/stream`)
    if (options.zoneCode) url.searchParams.set('zoneCode', options.zoneCode)
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${options.token}`,
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!response.ok) {
      if (response.status === 401) {
        stopped = true
        options.onAuthenticationExpired()
        return
      }
      throw new ApiError('Real-time order alerts are temporarily unavailable.', response.status, response.headers.get('x-request-id'))
    }
    if (!response.body) {
      throw new ApiError('The real-time order stream did not start.', response.status, response.headers.get('x-request-id'))
    }

    options.onStatusChange('live')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let frameBoundary = buffer.indexOf('\n\n')
        while (frameBoundary !== -1) {
          const frame = parseSseFrame(buffer.slice(0, frameBoundary))
          buffer = buffer.slice(frameBoundary + 2)
          frameBoundary = buffer.indexOf('\n\n')
          if (!frame) continue
          if (frame.id) lastEventId = frame.id
          if (frame.event !== 'order.created') continue
          try {
            const orderEvent = normalizeNewOrderEvent(JSON.parse(frame.data))
            if (orderEvent) options.onOrderCreated(orderEvent)
          } catch {
            // A malformed realtime message is ignored; regular polling still reconciles orders.
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    if (!stopped) {
      throw new Error('The real-time order stream ended.')
    }
  }

  const run = async () => {
    let reconnectDelayMs = 1_000
    while (!stopped) {
      options.onStatusChange(lastEventId ? 'reconnecting' : 'connecting')
      try {
        await readConnection()
        reconnectDelayMs = 1_000
      } catch {
        if (stopped) return
        options.onStatusChange('reconnecting')
        await pause(reconnectDelayMs)
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15_000)
      }
    }
  }

  void run()
  return () => {
    stopped = true
    controller.abort()
  }
}

export async function loginAdminWithGoogleIdToken(idToken: string): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/google/login', {
    method: 'POST',
    body: { idToken },
  })
}

export async function completeAdminGoogleRedirectLogin(): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/google/redirect/session', {
    credentials: 'include',
  })
}

export async function loginAdminWithMockGoogleProfile(email: string, givenName: string, familyName: string): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/google/login', {
    method: 'POST',
    body: {
      google_profile: {
        email,
        given_name: givenName,
        family_name: familyName,
        sub: `admin-${email}-${Date.now()}`,
        email_verified: true,
      },
    },
  })
}

export async function requestAdminOtp(mobileNo: string): Promise<{ otp: string | null }> {
  return request<{ otp: string | null }>('/admin/auth/otp/request', {
    method: 'POST',
    body: { mobile_no: mobileNo },
  })
}

export async function verifyAdminOtp(mobileNo: string, otp: string): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/otp/verify', {
    method: 'POST',
    body: { mobile_no: mobileNo, otp },
  })
}

export async function getAdministrators(token: string): Promise<AdminAdministratorResult> {
  return request<AdminAdministratorResult>('/admin/administrators', { token })
}

export async function grantAdministrator(
  token: string,
  payload: { fullName: string; emailAddress: string; mobileNo?: string },
): Promise<AdminAdministrator> {
  return request<AdminAdministrator>('/admin/administrators', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function revokeAdministrator(token: string, userId: number): Promise<AdminAdministrator> {
  return request<AdminAdministrator>(`/admin/administrators/${userId}`, {
    method: 'DELETE',
    token,
  })
}

export async function getDashboard(
  token: string,
  query: { zoneCode?: string } = {},
): Promise<AdminDashboard> {
  return request<AdminDashboard>('/admin/dashboard', { token, query })
}

export async function getOrderHistory(
  token: string,
  query: { zoneCode?: string; days?: number } = {},
): Promise<AdminOrderHistory> {
  return request<AdminOrderHistory>('/admin/order-history', { token, query })
}

export async function getProvisionedMerchants(token: string): Promise<AdminMerchantProfile[]> {
  return request<AdminMerchantProfile[]>('/admin/merchants', { token })
}

export async function getProductMerchantAssignments(
  token: string,
): Promise<AdminProductMerchantAssignment[]> {
  return request<AdminProductMerchantAssignment[]>('/admin/merchants/products/assignments', { token })
}

export async function createCatalogProduct(
  token: string,
  payload: {
    productCode: string
    productName: string
    categoryName: string
    price: string
    imageUrl?: string
    description?: string
  },
): Promise<AdminCatalogProduct> {
  return request<AdminCatalogProduct>('/admin/catalog/products', {
    method: 'POST',
    token,
    body: {
      product_code: payload.productCode,
      product_type_cd: 'PRODUCT',
      product_des: payload.productName,
      category_des: payload.categoryName,
      information_1: payload.description || undefined,
      charge_definition: [
        {
          charge_type_cd: 'ONETIME',
          charge_ver: 1,
          charge_amount: payload.price,
        },
      ],
      product_images: payload.imageUrl
        ? [{ url: payload.imageUrl, category_description: 'IMAGE' }]
        : [],
      product_labels: [],
    },
  })
}

export async function assignProductToMerchant(
  token: string,
  productCode: string,
  payload: { merchantUid: number; prepTimeMinutes: number; activeYn?: 'Y' | 'N' },
): Promise<AdminProductMerchantAssignment> {
  return request<AdminProductMerchantAssignment>(
    `/admin/merchants/products/${encodeURIComponent(productCode.toUpperCase())}`,
    {
      method: 'PUT',
      token,
      body: {
        merchant_uid: payload.merchantUid,
        prep_time_minutes: payload.prepTimeMinutes,
        active_yn: payload.activeYn ?? 'Y',
      },
    },
  )
}

export async function searchOrders(
  token: string,
  query: {
    page?: number
    pageSize?: number
    query?: string
    status?: string
    zoneCode?: string
  } = {},
): Promise<AdminOrderSearchResult> {
  return request<AdminOrderSearchResult>('/admin/orders', {
    token,
    query,
  })
}

export async function getOrderDetail(token: string, woNo: number): Promise<AdminOrderDetail> {
  return request<AdminOrderDetail>(`/admin/orders/${woNo}`, { token })
}

export async function updateOrderStatus(
  token: string,
  woNo: number,
  payload: { orderStatus: string; riderUid?: number | null; note?: string },
): Promise<{ result: string; parent_order_no: number }> {
  return request<{ result: string; parent_order_no: number }>(`/admin/orders/${woNo}/status`, {
    method: 'PUT',
    token,
    body: {
      order_status: payload.orderStatus,
      riderUid: payload.riderUid ?? undefined,
      note: payload.note,
    },
  })
}

export async function getRiders(token: string, liveOnly = false): Promise<AdminRiderListResult> {
  return request<AdminRiderListResult>(liveOnly ? '/admin/riders/live' : '/admin/riders', { token })
}

export async function getMerchantPayouts(
  token: string,
  query: { page?: number; pageSize?: number; query?: string } = {},
): Promise<AdminMerchantPayoutSummaryResult> {
  return request<AdminMerchantPayoutSummaryResult>('/admin/merchants/payouts', {
    token,
    query,
  })
}

export async function getMerchantPayoutDetail(token: string, merchantUid: number): Promise<AdminMerchantPayoutDetail> {
  return request<AdminMerchantPayoutDetail>(`/admin/merchants/${merchantUid}/payouts`, { token })
}

export async function markMerchantPayoutPaid(
  token: string,
  merchantUid: number,
  payload: { payoutReference?: string; note?: string; orderNos?: number[] },
): Promise<AdminMerchantPayoutDetail> {
  return request<AdminMerchantPayoutDetail>(`/admin/merchants/${merchantUid}/payouts/mark-paid`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getReferralConfig(token: string): Promise<AdminReferralConfig> {
  const payload = await request<Record<string, unknown>>('/admin/referrals/config', { token })
  return normalizeReferralConfig(payload)
}

export async function updateReferralConfig(
  token: string,
  payload: {
    enabled: boolean
    startAt: string | null
    endAt: string | null
    referrerRewardPoints: string
    refereeRewardPoints: string
    pointsToCurrencyRate: string
    minimumOrderValue: string
    maxReferralsPerUser: number
    maxEarningsPerUser: string
    maxWalletUsagePercent: string
    testMode: boolean
  },
): Promise<AdminReferralConfig> {
  const responsePayload = await request<Record<string, unknown>>('/admin/referrals/config', {
    method: 'PUT',
    token,
    body: payload,
  })
  return normalizeReferralConfig(responsePayload)
}

export async function getReferralAnalytics(token: string): Promise<AdminReferralAnalytics> {
  const payload = await request<Record<string, unknown>>('/admin/referrals/analytics', { token })
  return normalizeReferralAnalytics(payload)
}

export async function getReferralList(
  token: string,
  query: {
    page?: number
    pageSize?: number
    query?: string
    status?: string
    rewardStatus?: string
  } = {},
): Promise<AdminReferralListResult> {
  const payload = await request<Record<string, unknown>>('/admin/referrals', {
    token,
    query,
  })
  return normalizeReferralList(payload)
}

export async function runReferralTest(
  token: string,
  payload: {
    mode: string
    refereeUserId: number
    referralCode?: string
    deviceId?: string
    qualifyingOrderNo?: number
  },
): Promise<{ result: string }> {
  return request<{ result: string }>('/admin/referrals/test', {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function creditReferralWallet(
  token: string,
  payload: { userId: number; pointsAmount: string; note?: string },
): Promise<AdminWalletCreditResponse> {
  const responsePayload = await request<Record<string, unknown>>('/admin/referrals/wallet-credit', {
    method: 'POST',
    token,
    body: payload,
  })
  return normalizeWalletCreditResponse(responsePayload)
}

export async function getObservabilitySummary(
  token: string,
  hours = 24,
): Promise<ObservabilitySummary> {
  return request<ObservabilitySummary>('/admin/observability/summary', {
    token,
    query: { hours },
  })
}

export async function getOperationalEvents(
  token: string,
  query: {
    page?: number
    pageSize?: number
    query?: string
    category?: 'ERROR' | 'SECURITY' | 'AUTH'
    severity?: string
    source?: string
    eventType?: string
    countryCode?: string
  },
): Promise<OperationalEventResult> {
  return request<OperationalEventResult>('/admin/observability/events', {
    token,
    query,
  })
}

export async function getDispatchIncidents(
  token: string,
  query: { page?: number; pageSize?: number; status?: string } = {},
): Promise<DispatchIncidentResult> {
  return request<DispatchIncidentResult>('/admin/dispatch/incidents', { token, query })
}

export async function acknowledgeDispatchIncident(token: string, incidentId: number): Promise<DispatchIncident> {
  return request<DispatchIncident>(`/admin/dispatch/incidents/${incidentId}/acknowledge`, {
    method: 'POST',
    token,
  })
}
