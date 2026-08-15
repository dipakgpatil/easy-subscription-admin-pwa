export type AdminSession = {
  access_token: string
  token_type: string
  user_id: number
  account_no: number | null
  role: string
  is_admin: boolean
  display_name: string | null
  email_address: string | null
  mobile_no: string | null
}

export type AdminZoneSummary = {
  zone_code: string | null
  zone_name: string | null
  active_orders: number
  completed_today: number
  online_riders: number
  pending_merchant_payout_amount: string
}

export type AdminOrderListItem = {
  order_no: number
  basket_uid: number
  order_status: string
  order_placed_on: string | null
  customer_name: string | null
  customer_mobile: string | null
  delivery_address: string | null
  service_zone_code: string | null
  service_zone_name: string | null
  merchant_names: string[]
  rider_names: string[]
  payment_status: string | null
  payment_amount: string | null
  payment_method_type: string | null
  child_order_count: number
  issue_flags: string[]
}

export type AdminOrderSearchResult = {
  total: number
  page: number
  page_size: number
  items: AdminOrderListItem[]
}

export type AdminParty = {
  name: string | null
  mobile_no: string | null
  email_address: string | null
}

export type AdminDelivery = {
  full_address: string | null
  service_zone_code: string | null
  service_zone_name: string | null
  latitude: number | null
  longitude: number | null
  address_label: string | null
}

export type AdminPaymentSummary = {
  payment_status: string | null
  payment_amount: string | null
  payment_method_type: string | null
  payment_date: string | null
  gateway_order_no: string | null
}

export type AdminMerchantMini = {
  merchant_uid: number
  display_name: string
  location_label: string | null
  kitchen_type: string | null
  availability_status: string | null
}

export type AdminRiderMini = {
  rider_uid: number
  display_name: string
  mobile_no: string | null
  availability_status: string
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
}

export type AdminOrderItem = {
  item_no: number
  product_code: string
  product_name: string
  quantity: string
  image_url: string | null
}

export type AdminTimelineStep = {
  label: string
  status: string
  timestamp: string | null
}

export type AdminFulfillmentGroup = {
  wo_no: number
  order_status: string
  merchant: AdminMerchantMini | null
  rider: AdminRiderMini | null
  accepted_at: string | null
  prep_started_at: string | null
  ready_at: string | null
  completed_at: string | null
  subtotal_amount: string
  payout_amount: string | null
  payout_status: string | null
  estimated_prep_minutes: number | null
  items: AdminOrderItem[]
  timeline: AdminTimelineStep[]
}

export type AdminOrderDetail = {
  order_no: number
  basket_uid: number
  order_status: string
  order_placed_on: string | null
  issue_flags: string[]
  customer: AdminParty
  delivery: AdminDelivery
  payment: AdminPaymentSummary
  fulfillment_groups: AdminFulfillmentGroup[]
}

export type AdminRiderListItem = {
  rider_uid: number
  display_name: string
  mobile_no: string | null
  vehicle_type: string | null
  availability_status: string
  latitude: number | null
  longitude: number | null
  location_updated_at: string | null
  active_order_no: number | null
  active_order_status: string | null
  pending_payout_amount: string
}

export type AdminRiderListResult = {
  total: number
  items: AdminRiderListItem[]
}

export type AdminMerchantProfile = {
  merchant_uid: number
  user_id: number
  display_name: string
  email_address: string | null
  mobile_no: string | null
  pickup_group_code: string | null
  kitchen_type: string
  status_cd: string
  availability_status: string
  effective_availability_status: string
  pause_active: boolean
  pause_scheduled: boolean
  pause_start_at: string | null
  pause_end_at: string | null
  default_prep_minutes: number
  location_label: string | null
  coverage_zone_codes: string[]
}

export type AdminCatalogProduct = {
  ProductCode: string
  ProductDescription: string | null
  ProductType: string
  ImageUrl: string
}

export type AdminProductMerchantAssignment = {
  product_code: string
  merchant_uid: number
  merchant_name: string
  prep_time_minutes: number
  active_yn: string
}

export type AdminMerchantPayoutSummary = {
  merchant_uid: number
  merchant_name: string
  location_label: string | null
  completed_orders: number
  pending_orders: number
  total_payout_amount: string
  paid_payout_amount: string
  pending_payout_amount: string
  last_order_at: string | null
  last_paid_at: string | null
}

export type AdminMerchantPayoutSummaryResult = {
  total: number
  page: number
  page_size: number
  items: AdminMerchantPayoutSummary[]
}

export type AdminMerchantPayoutOrder = {
  wo_no: number
  order_status: string
  order_placed_on: string | null
  earned_at: string | null
  payout_amount: string
  payout_status: string
  settled_at: string | null
  customer_name: string | null
  service_zone_code: string | null
  delivery_address: string | null
}

export type AdminMerchantPayoutDetail = {
  summary: AdminMerchantPayoutSummary
  orders: AdminMerchantPayoutOrder[]
}

export type AdminDashboard = {
  active_orders: number
  ready_for_pickup: number
  in_transit: number
  completed_today: number
  online_riders: number
  active_merchants: number
  pending_merchant_payout_amount: string
  pending_rider_payout_amount: string
  zone_summary: AdminZoneSummary[]
  attention_orders: AdminOrderListItem[]
  recent_orders: AdminOrderListItem[]
}

export type AdminReferralConfig = {
  enabled: boolean
  startAt: string | null
  endAt: string | null
  referrerRewardPoints: string
  referrerRewardAmount: string
  refereeRewardPoints: string
  refereeRewardAmount: string
  pointsToCurrencyRate: string
  minimumOrderValue: string
  maxReferralsPerUser: number
  maxEarningsPerUser: string
  maxWalletUsagePercent: string
  testMode: boolean
}

export type AdminReferralAnalytics = {
  totalReferralsSent: number
  totalSignedUp: number
  successfulConversions: number
  referredRevenue: string
  totalRewardsDistributed: string
  pendingRewardsAmount: string
}

export type AdminReferralListItem = {
  id: number
  referrerName: string | null
  referrerEmail: string | null
  referralCode: string
  refereeName: string | null
  refereeMobile: string | null
  status: string
  rewardStatus: string
  qualifyingOrderNo: number | null
  referrerRewardAmount: string
  refereeRewardAmount: string
  createdAt: string | null
  qualifiedAt: string | null
  rewardedAt: string | null
  rejectionReason: string | null
}

export type AdminReferralListResult = {
  total: number
  page: number
  pageSize: number
  items: AdminReferralListItem[]
}

export type AdminWalletCreditResponse = {
  result: string
  walletAmount: string
  totalPoints: string
}

export type CountryActivity = {
  country_code: string
  login_count: number
  unique_users: number
  last_seen_at: string | null
}

export type ObservabilitySummary = {
  window_hours: number
  total_errors: number
  backend_errors: number
  client_errors: number
  security_events: number
  authentication_failures: number
  authorization_failures: number
  rate_limit_events: number
  successful_logins: number
  affected_users: number
  anonymous_sources: number
  country_activity: CountryActivity[]
}

export type OperationalEvent = {
  id: number
  event_uid: string
  occurred_at: string
  category: 'ERROR' | 'SECURITY' | 'AUTH'
  event_type: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  source: string
  user_id: number | null
  user_display_name: string | null
  user_email: string | null
  anonymous_id: string | null
  source_ip: string | null
  country_code: string | null
  country_source: string | null
  network_country_code: string | null
  network_edge: string | null
  request_id: string | null
  method: string | null
  endpoint: string | null
  flow: string | null
  status_code: number | null
  error_code: string | null
  user_message: string | null
  exception_type: string | null
  fingerprint: string | null
  platform: string | null
  app_version: string | null
  user_agent: string | null
  duration_ms: number | null
  integrity_valid: boolean
}

export type OperationalEventResult = {
  total: number
  page: number
  pageSize: number
  items: OperationalEvent[]
}

export type DispatchIncident = {
  id: number
  delivery_task_id: number
  parent_wo_no: number
  service_zone_code: string | null
  task_status: string
  rider_uid: number | null
  incident_type: string
  severity: string
  status_cd: string
  title: string
  details: Record<string, unknown> | null
  first_detected_at: string
  last_detected_at: string
  last_notified_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

export type DispatchIncidentResult = {
  total: number
  page: number
  pageSize: number
  items: DispatchIncident[]
}
