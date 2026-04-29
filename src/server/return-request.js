const FIELD_LABELS = {
  delivery_no: "送貨貨號",
  customer_name: "名稱",
  phone: "電話號碼",
  photos: "商品照片"
};

export function isReturnRequestMessage(message, conversationHistory = []) {
  const text = String(message || "");
  if (/退貨|退款|換貨|退換貨|退掉|想退|我要退/.test(text)) return true;

  return hasRecentReturnContext(conversationHistory) && looksLikeReturnDetails(text);
}

export function getMissingReturnFields(classification, message = "") {
  if (classification?.intent !== "return_request") return [];

  const info = extractReturnInfo(message);
  return Object.keys(FIELD_LABELS).filter((field) => !info[field]);
}

export function buildReturnInformationRequestReply() {
  return "請提供您的送貨貨號、名稱、電話號碼等資料，以及商品的照片。\n收到資料後，我會把退貨申請轉交客服人員確認。";
}

export function buildReturnHandoffReply() {
  return "十分抱歉造成您的不便。\n我已經把您提供的退貨資料整理到客服後台，客服人員會協助確認後續退貨處理。";
}

export function summarizeReturnInfo(message = "") {
  const info = extractReturnInfo(message);
  const parts = [
    info.delivery_no ? `送貨貨號：${info.delivery_no}` : "",
    info.customer_name ? `名稱：${info.customer_name}` : "",
    info.phone ? `電話：${info.phone}` : "",
    info.photos ? "商品照片：已提供" : ""
  ].filter(Boolean);

  return parts.join("，");
}

function extractReturnInfo(message = "") {
  const text = String(message || "").trim();
  const deliveryNo = text.match(/\b(?:RC|TRK|TRACK|SHIP|RAC|ORD|ORDER|O)[-_]?[A-Z0-9]{4,16}\b/i)?.[0] ||
    text.match(/(?:送貨貨號|貨號|物流單號|訂單編號)[:：\s]*([A-Z0-9-_]{4,20})/i)?.[1] ||
    "";
  const phone = text.match(/09\d{8}/)?.[0] ||
    text.match(/(?:電話|手機)[:：\s]*(\+?\d[\d\s-]{7,18})/)?.[1] ||
    "";
  const name = text.match(/(?:名稱|姓名|名字)[:：\s]*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z\s]{1,20})/)?.[1]?.trim() || "";
  const photos = /照片|圖片|相片|影像|已上傳|已提供/.test(text);

  return {
    delivery_no: normalizeIdentifier(deliveryNo),
    customer_name: name,
    phone: normalizePhone(phone),
    photos
  };
}

function hasRecentReturnContext(conversationHistory = []) {
  return conversationHistory.slice(-6).some((item) => {
    return /退貨|退款|換貨|退換貨|送貨貨號|商品照片/.test(String(item.content || ""));
  });
}

function looksLikeReturnDetails(message = "") {
  return /(送貨貨號|貨號|物流單號|訂單編號|名稱|姓名|名字|電話|手機|照片|圖片|相片|09\d{8})/.test(String(message || ""));
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePhone(value) {
  return String(value || "").trim().replace(/[\s-]/g, "");
}
