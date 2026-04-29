const FIELD_LABELS = {
  delivery_no: "送貨貨號",
  customer_name: "姓名",
  phone: "電話號碼"
};

export function isReturnRequestMessage(message, conversationHistory = []) {
  const text = String(message || "");
  if (isReturnPolicyQuestion(text)) return false;
  if (/退貨|退款|換貨|退換貨|退掉|想退|我要退/.test(text)) return true;
  if (/(壞掉|破損|損壞|瑕疵|故障|不能用|有問題|少件|缺件).*(商品|東西|貨|包裹)|(商品|東西|貨|包裹).*(壞掉|破損|損壞|瑕疵|故障|不能用|有問題|少件|缺件)|收到.*(壞掉|破損|損壞|瑕疵|故障|不能用|有問題|少件|缺件)/.test(text)) {
    return true;
  }
  if (hasCompleteReturnDetails(text)) return true;

  return hasRecentReturnContext(conversationHistory) && looksLikeReturnDetails(text);
}

export function getMissingReturnFields(classification, message = "", conversationHistory = []) {
  if (classification?.intent !== "return_request") return [];

  const info = extractReturnInfo(message, conversationHistory);
  return Object.keys(FIELD_LABELS).filter((field) => !info[field]);
}

export function buildReturnInformationRequestReply() {
  return "請提供您的送貨貨號、姓名、電話號碼。\n若方便，您也可以上傳商品照片供客服參考。\n收到必要資料後，我會把退貨申請轉交客服人員確認。";
}

export function buildReturnHandoffReply() {
  return "請稍後，客服人員將很快為您服務。";
}

export function summarizeReturnInfo(message = "", attachments = [], conversationHistory = []) {
  const info = extractReturnInfo(message, conversationHistory);
  const photoCount = countPhotoAttachments(attachments);
  const parts = [
    info.delivery_no ? `送貨貨號：${info.delivery_no}` : "",
    info.customer_name ? `姓名：${info.customer_name}` : "",
    info.phone ? `電話：${info.phone}` : "",
    photoCount ? `附件：${photoCount} 張照片` : info.photos ? "附件：文字提到已提供照片" : ""
  ].filter(Boolean);

  return parts.join("，");
}

export function formatMissingReturnFields(fields = []) {
  return fields.map((field) => FIELD_LABELS[field] || field).join("、");
}

function extractReturnInfo(message = "", conversationHistory = []) {
  const current = extractReturnInfoFromText(message);
  if (!conversationHistory.length) return current;

  const previous = conversationHistory
    .slice(-8)
    .filter((item) => item.role === "customer")
    .map((item) => extractReturnInfoFromText(item.content))
    .reduce((acc, item) => ({
      delivery_no: acc.delivery_no || item.delivery_no,
      customer_name: acc.customer_name || item.customer_name,
      phone: acc.phone || item.phone,
      photos: acc.photos || item.photos
    }), {
      delivery_no: "",
      customer_name: "",
      phone: "",
      photos: false
    });

  return {
    delivery_no: current.delivery_no || previous.delivery_no,
    customer_name: current.customer_name || previous.customer_name,
    phone: current.phone || previous.phone,
    photos: current.photos || previous.photos
  };
}

function extractReturnInfoFromText(message = "") {
  const text = String(message || "").trim();
  const deliveryNo = text.match(/\b(?:RC|TRK|TRACK|SHIP|RAC|ORD|ORDER|O)[-_]?[A-Z0-9]{4,16}\b/i)?.[0] ||
    text.match(/(?:送貨貨號|貨號|物流單號|訂單編號)[:：\s]*([A-Z0-9-_]{4,20})/i)?.[1] ||
    "";
  const phone = text.match(/09\d{8}/)?.[0] ||
    text.match(/(?:電話|手機)[:：\s]*(\+?\d[\d\s-]{7,18})/)?.[1] ||
    "";
  const name = text.match(/(?:名稱|姓名|名字)[:：\s]*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z\s]{1,20})/)?.[1]?.trim() ||
    inferUnlabeledName(text, { deliveryNo, phone }) ||
    "";
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
  return /(送貨貨號|貨號|物流單號|訂單編號|名稱|姓名|名字|電話|手機|照片|圖片|相片|09\d{8}|\b(?:RC|TRK|TRACK|SHIP|RAC|ORD|ORDER|O)[-_]?[A-Z0-9]{4,16}\b)/i.test(String(message || ""));
}

function hasCompleteReturnDetails(message = "") {
  const info = extractReturnInfoFromText(message);
  return Boolean(info.delivery_no && info.customer_name && info.phone);
}

function isReturnPolicyQuestion(message = "") {
  const text = String(message || "");
  if (/我要|想退|退掉|申請|辦理|收到|壞掉|破損|損壞|瑕疵|故障|不能用/.test(text)) return false;
  return /(可以|能不能|可不可以|是否|怎麼|如何|期限|規則|條件|流程).*(退貨|退款|換貨|退換貨)|(退貨|退款|換貨|退換貨).*(可以嗎|能嗎|期限|規則|條件|流程)/.test(text);
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizePhone(value) {
  return String(value || "").trim().replace(/[\s-]/g, "");
}

function countPhotoAttachments(attachments = []) {
  return attachments.filter((item) => /^image\//.test(String(item.type || ""))).length;
}

function inferUnlabeledName(text, { deliveryNo, phone }) {
  if (!deliveryNo || !phone) return "";

  const cleaned = String(text || "")
    .replace(deliveryNo, " ")
    .replace(phone, " ")
    .replace(/退貨資料|送貨貨號|貨號|物流單號|訂單編號|電話|手機|姓名|名字|名稱|只有這個/g, " ")
    .replace(/[：:，,。.\s]+/g, " ")
    .trim();
  const candidates = cleaned.match(/[\u4e00-\u9fff]{2,4}/g) || [];
  return candidates.find((candidate) => !/退貨|資料|電話|貨號|只有|這個/.test(candidate)) || "";
}
