// Run with `npm test` (Node's built-in runner; Node strips the types itself).
// One order, one number: the customer's. A kitchen's sub-order is an internal ticket.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { incidentDetail, incidentTitle } from '../src/features/dispatch/incidentText.ts'
import { kitchenCount, kitchenPart, kitchenTicket } from '../src/features/orders/orderUtils.ts'

test('a kitchen ticket never reads as a second order number', () => {
  assert.equal(kitchenTicket(178), 'Kitchen ticket 178')
  assert.doesNotMatch(kitchenTicket(178), /#/)
})

test('moving a kitchen names the customer order, and the kitchen only when it is split', () => {
  assert.equal(kitchenPart(177, 'Pizza Hut', 1), 'order #177')
  assert.equal(kitchenPart(177, 'Pizza Hut', 2), "Pizza Hut's part of order #177")
  assert.equal(kitchenPart(177, null, 2), "one kitchen's part of order #177")
  assert.equal(kitchenCount(1), '1 kitchen')
  assert.equal(kitchenCount(2), '2 kitchens')
})

test('a stored merchant-delay incident is retitled with the customer order number', () => {
  const incident = {
    incident_type: 'MERCHANT_NO_RESPONSE:178',
    parent_wo_no: 177,
    title: 'Merchant has not acknowledged order #178',
    details: { parent_wo_no: 177, merchant_wo_no: 178, merchant_uid: 4 },
  }
  assert.equal(incidentTitle(incident), 'Kitchen has not accepted order #177')
  assert.equal(incidentDetail(incident), 'kitchen ticket 178 | merchant 4')
  assert.doesNotMatch(`${incidentTitle(incident)} ${incidentDetail(incident)}`, /#178/)
})

test('other incidents keep their own title and unknown details', () => {
  const incident = {
    incident_type: 'NO_RIDER_ACCEPTED',
    parent_wo_no: 177,
    title: 'No rider accepted delivery #177',
    details: { parent_wo_no: 177, service_zone_code: 'MAGARPATTA_CITY', attempts: 3 },
  }
  assert.equal(incidentTitle(incident), 'No rider accepted delivery #177')
  assert.equal(incidentDetail(incident), 'attempts: 3')
  assert.equal(incidentDetail({ ...incident, details: null }), '')
})
