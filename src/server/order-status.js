export function getMissingOrderFields(classification, message = "") {
  if (classification?.intent !== "order_status") return [];
  const identifiers = getOrderIdentifiers(classification, message);
  return identifiers.orderNo || identifiers.trackingNo ? [] : ["order_identifier"];
}

export function getOrderIdentifiers(classification = {}, message = "") {
  const fromClassification = {
    orderNo: normalizeIdentifier(classification.order_no || classification.orderNo),
    trackingNo: normalizeIdentifier(classification.tracking_no || classification.trackingNo)
  };
  if (fromClassification.orderNo || fromClassification.trackingNo) return fromClassification;

  return extractOrderIdentifiersFromText(message);
}

export function extractOrderIdentifiersFromText(message = "") {
  const text = String(message || "").trim();
  const orderMatch = text.match(/\b(?:RAC|ORD|ORDER|O)[-_]?\d{4,12}\b/i);
  const trackingMatch = text.match(/\b(?:RC|TRK|TRACK|SHIP)[-_]?[A-Z0-9]{6,16}\b/i);

  return {
    orderNo: normalizeIdentifier(orderMatch?.[0]),
    trackingNo: normalizeIdentifier(trackingMatch?.[0])
  };
}

export function buildOrderStatusReply(orderStatus) {
  if (!orderStatus?.found) {
    return "請稍後，客服人員將很快為您服務。";
  }

  const parts = [
    "我幫您查到目前的貨態如下。",
    `訂單編號：${orderStatus.order_no || "-"}`,
    `物流單號：${orderStatus.tracking_no || "-"}`,
    `目前狀態：${orderStatus.status_label || orderStatus.status || "-"}`,
    orderStatus.current_location ? `目前位置：${orderStatus.current_location}` : "",
    orderStatus.last_event_at ? `最後更新：${formatDate(orderStatus.last_event_at)}` : "",
    orderStatus.estimated_delivery ? `預計到貨：${formatDate(orderStatus.estimated_delivery)}` : "",
    orderStatus.note ? `補充說明：${orderStatus.note}` : ""
  ].filter(Boolean);

  return parts.join("\n");
}

export function formatMissingOrderFields() {
  return "訂單編號或物流單號";
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "") || "";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
