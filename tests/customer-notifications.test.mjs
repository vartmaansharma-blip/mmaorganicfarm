import assert from "node:assert/strict";
import test from "node:test";
import { customerNotificationDestination } from "../lib/customer-notifications.ts";
import { FARM_PHONE_LINK, customerDeliveryWhatsApp, farmWhatsApp } from "../lib/farm-contact.ts";

test("notification links are generated only from known kinds and valid identifiers", () => {
  const id = "00000000-0000-4000-8000-000000000006";
  assert.equal(customerNotificationDestination({ kind: "payment_confirmed", order_id: id }).href, `/account?section=orders&order=${id}#selected-order`);
  assert.equal(customerNotificationDestination({ kind: "delivery_failed", delivery_id: id }).href, `/account?section=schedule&delivery=${id}#selected-delivery`);
  assert.equal(customerNotificationDestination({ kind: "delivery_failed", delivery_id: "//example.invalid" }).href, "/account?section=schedule");
  assert.equal(customerNotificationDestination({ kind: "payment_confirmed", order_id: "?next=https://example.invalid" }), null);
});

test("farm contact uses the new number and delivery outreach targets only a valid customer number", () => {
  assert.equal(FARM_PHONE_LINK, "tel:+917546998822");
  assert.equal(farmWhatsApp("Order help"), "https://wa.me/917546998822?text=Order%20help");
  assert.equal(customerDeliveryWhatsApp("+91 (90000) 00000", "Delivery update"), "https://wa.me/919000000000?text=Delivery%20update");
  assert.equal(customerDeliveryWhatsApp("7546998822", "Delivery update"), null);
  assert.equal(customerDeliveryWhatsApp("9000000000?foo", "Delivery update"), null);
});
