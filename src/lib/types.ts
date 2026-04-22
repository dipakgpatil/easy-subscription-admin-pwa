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
