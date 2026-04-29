import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOrderStatusReply,
  extractOrderIdentifiersFromText,
  getMissingOrderFields,
  getOrderIdentifiers
} from "../src/server/order-status.js";

test("extracts order and tracking identifiers from customer text", () => {
  const identifiers = extractOrderIdentifiersFromText("請幫我查 RAC1001，物流單號 RC123456789TW");

  assert.equal(identifiers.orderNo, "RAC1001");
  assert.equal(identifiers.trackingNo, "RC123456789TW");
});

test("uses classification identifiers before parsing free text", () => {
  const identifiers = getOrderIdentifiers({
    order_no: "rac1002",
    tracking_no: "rc987654321tw"
  }, "查 RAC1001");

  assert.deepEqual(identifiers, {
    orderNo: "RAC1002",
    trackingNo: "RC987654321TW"
  });
});

test("moves tracking-shaped classifier order_no into trackingNo", () => {
  const identifiers = getOrderIdentifiers({
    order_no: "RC987654321TW"
  }, "RC987654321TW 送到了嗎");

  assert.deepEqual(identifiers, {
    orderNo: "",
    trackingNo: "RC987654321TW"
  });
});

test("requires an order number or tracking number for order status", () => {
  const missing = getMissingOrderFields({
    intent: "order_status"
  }, "我想查貨態");

  assert.deepEqual(missing, ["order_identifier"]);
});

test("formats found order status for customer-facing replies", () => {
  const reply = buildOrderStatusReply({
    found: true,
    order_no: "RAC1001",
    tracking_no: "RC123456789TW",
    status: "in_transit",
    status_label: "配送中",
    current_location: "桃園轉運中心",
    estimated_delivery: "2026-05-02T10:00:00+08:00",
    last_event_at: "2026-04-29T09:30:00+08:00",
    note: "包裹已完成分揀，等待下一段配送。"
  });

  assert.match(reply, /訂單編號：RAC1001/);
  assert.match(reply, /物流單號：RC123456789TW/);
  assert.match(reply, /目前狀態：配送中/);
  assert.match(reply, /桃園轉運中心/);
});
