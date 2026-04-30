export const demoTickets = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    ticket_no: "T001",
    customer_id: "seed-demo",
    status: "needs_review",
    summary: "客戶要求真人客服處理退貨",
    intent: "human_handoff",
    priority: "normal",
    handoff_reason: "使用者明確要求真人客服，建立待處理工單。",
    created_at: "2026-04-30T09:00:00+08:00",
    updated_at: "2026-04-30T09:00:00+08:00"
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    ticket_no: "T002",
    customer_id: "seed-demo",
    status: "needs_review",
    summary: "收到瑕疵商品，需要退貨資料確認",
    intent: "return_request",
    priority: "high",
    handoff_reason: "退貨申請含商品瑕疵，需要客服人員確認照片與資料。",
    created_at: "2026-04-30T09:10:00+08:00",
    updated_at: "2026-04-30T09:10:00+08:00"
  },
  {
    id: "11111111-1111-4111-8111-111111111113",
    ticket_no: "T003",
    customer_id: "seed-demo",
    status: "in_progress",
    summary: "客戶查詢 RAC1004 目前配送位置",
    intent: "order_status",
    priority: "high",
    handoff_reason: null,
    created_at: "2026-04-30T09:20:00+08:00",
    updated_at: "2026-04-30T09:25:00+08:00"
  },
  {
    id: "11111111-1111-4111-8111-111111111114",
    ticket_no: "T004",
    customer_id: "seed-demo",
    status: "closed",
    summary: "客戶完成 2000 元內商品推薦諮詢",
    intent: "product_recommendation",
    priority: "normal",
    handoff_reason: null,
    created_at: "2026-04-30T09:30:00+08:00",
    updated_at: "2026-04-30T09:45:00+08:00"
  }
];

export const demoMessages = [
  {
    id: "22222222-2222-4222-8222-222222222221",
    ticket_id: "11111111-1111-4111-8111-111111111111",
    role: "customer",
    content: "我要找真人客服",
    created_at: "2026-04-30T09:00:00+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    ticket_id: "11111111-1111-4111-8111-111111111111",
    role: "system",
    content: "請稍後，客服人員將很快為您服務。",
    created_at: "2026-04-30T09:00:03+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222223",
    ticket_id: "11111111-1111-4111-8111-111111111112",
    role: "customer",
    content: "收到的商品破損，我要退貨",
    created_at: "2026-04-30T09:10:00+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222224",
    ticket_id: "11111111-1111-4111-8111-111111111112",
    role: "ai",
    content: "請提供您的送貨貨號、姓名、電話號碼。若方便，您也可以上傳商品照片供客服參考。",
    created_at: "2026-04-30T09:10:05+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222225",
    ticket_id: "11111111-1111-4111-8111-111111111113",
    role: "customer",
    content: "RAC1004 的東西在哪",
    created_at: "2026-04-30T09:20:00+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222226",
    ticket_id: "11111111-1111-4111-8111-111111111113",
    role: "ai",
    content: "我幫您查到目前狀態為配送中，目前位置是新北配送站，預計 2026/05/01 到貨。",
    created_at: "2026-04-30T09:20:04+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222227",
    ticket_id: "11111111-1111-4111-8111-111111111114",
    role: "customer",
    content: "我要 2000 以下的送禮商品",
    created_at: "2026-04-30T09:30:00+08:00"
  },
  {
    id: "22222222-2222-4222-8222-222222222228",
    ticket_id: "11111111-1111-4111-8111-111111111114",
    role: "ai",
    content: "依照您的需求，為您推薦以下選項。\n\nP002｜行動辦公耳機\n價格：NT$ 1,680\n詳情連結：/products/P002",
    created_at: "2026-04-30T09:30:05+08:00"
  }
];

export const demoAiDecisions = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    ticket_id: "11111111-1111-4111-8111-111111111111",
    intent: "human_handoff",
    confidence: 0.92,
    tone: "neutral",
    decision: "needs_review",
    reasons: ["使用者明確要求真人客服，建立待處理工單。"],
    risk_flags: [],
    matched_faq_code: null,
    recommended_product_codes: [],
    handoff_reason: "使用者明確要求真人客服，建立待處理工單。",
    raw_classification: { intent: "human_handoff", confidence: 0.92, need_human: true },
    created_at: "2026-04-30T09:00:02+08:00"
  },
  {
    id: "33333333-3333-4333-8333-333333333332",
    ticket_id: "11111111-1111-4111-8111-111111111112",
    intent: "return_request",
    confidence: 0.9,
    tone: "worried",
    decision: "needs_review",
    reasons: ["退貨申請含商品瑕疵，需要客服人員確認照片與資料。"],
    risk_flags: ["return_photo_review"],
    matched_faq_code: "F001",
    recommended_product_codes: [],
    handoff_reason: "退貨申請含商品瑕疵，需要客服人員確認照片與資料。",
    raw_classification: { intent: "return_request", confidence: 0.9, missing_fields: ["order_identifier", "name", "phone"] },
    created_at: "2026-04-30T09:10:03+08:00"
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    ticket_id: "11111111-1111-4111-8111-111111111113",
    intent: "order_status",
    confidence: 0.88,
    tone: "neutral",
    decision: "auto_reply",
    reasons: ["命中貨態查詢，已查詢 demo order_statuses。"],
    risk_flags: [],
    matched_faq_code: null,
    recommended_product_codes: [],
    handoff_reason: null,
    raw_classification: { intent: "order_status", confidence: 0.88, order_no: "RAC1004" },
    created_at: "2026-04-30T09:20:03+08:00"
  },
  {
    id: "33333333-3333-4333-8333-333333333334",
    ticket_id: "11111111-1111-4111-8111-111111111114",
    intent: "product_recommendation",
    confidence: 0.86,
    tone: "neutral",
    decision: "auto_reply",
    reasons: ["依照預算與用途推薦符合 DB 價格條件的商品。"],
    risk_flags: [],
    matched_faq_code: null,
    recommended_product_codes: ["P002"],
    handoff_reason: null,
    raw_classification: { intent: "product_recommendation", confidence: 0.86, budget_max: 2000, use_case: "送禮" },
    created_at: "2026-04-30T09:30:03+08:00"
  }
];
