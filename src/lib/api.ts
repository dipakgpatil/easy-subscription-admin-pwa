import type {
  AdminDashboard,
  AdminMerchantPayoutDetail,
  AdminMerchantPayoutSummaryResult,
  AdminOrderDetail,
  AdminOrderSearchResult,
  AdminRiderListResult,
  AdminSession,
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
