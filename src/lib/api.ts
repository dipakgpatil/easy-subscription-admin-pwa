import type {
  AdminDashboard,
  AdminMerchantPayoutDetail,
  AdminMerchantPayoutSummaryResult,
  AdminOrderDetail,
  AdminOrderSearchResult,
  AdminReferralAnalytics,
  AdminReferralConfig,
  AdminReferralListResult,
  AdminRiderListResult,
  AdminSession,
  AdminWalletCreditResponse,
} from './types'

const DEFAULT_API_BASE_URL = 'https://easy-subscription-python-api-production.up.railway.app/api/v1'
const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim() || DEFAULT_API_BASE_URL

export const appConfig = {
  apiBaseUrl: API_BASE_URL,
  googleClientId: ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim(),
  allowMockGoogle: ((import.meta.env.VITE_ALLOW_MOCK_GOOGLE as string | undefined) ?? 'true').trim() !== 'false',
  dashboardPollIntervalMs: 15000,
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
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
  method?: 'GET' | 'POST' | 'PUT'
  token?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`)
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? 'Request failed')
        : `Request failed with status ${response.status}`
    throw new ApiError(message, response.status)
  }
  return payload as T
}

export async function loginAdminWithGoogleIdToken(idToken: string): Promise<AdminSession> {
  return request<AdminSession>('/admin/auth/google/login', {
    method: 'POST',
    body: { idToken },
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

export async function getDashboard(token: string): Promise<AdminDashboard> {
  return request<AdminDashboard>('/admin/dashboard', { token })
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
