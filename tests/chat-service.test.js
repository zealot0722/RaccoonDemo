import test from "node:test";
import assert from "node:assert/strict";

import { handleChat, isConversationEndMessage } from "../src/server/chat-service.js";

test("chat workflow recommends product details inside the assistant reply", async () => {
  const result = await handleChat({
    message: "我想找 1000 元內的新手商品",
    sessionId: "test-session-recommend"
  });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.decision.decision, "auto_reply");
  assert.ok(result.recommendedProducts.length >= 1);
  assert.equal(result.recommendedProducts[0].code, "P001");
  assert.match(result.reply, /詳情連結：\/products\/P001/);
  assert.match(result.reply, /還有其他問題需要協助/);
  assert.equal(result.conversationEnded, false);
  assert.equal(result.ticket.status, "auto_replied");
});

test("chat workflow asks for missing product conditions without products", async () => {
  const result = await handleChat({
    message: "推薦商品",
    sessionId: "test-session-missing"
  });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.deepEqual(result.missingProductFields, ["budget", "use_case"]);
  assert.equal(result.recommendedProducts.length, 0);
  assert.match(result.reply, /請問您要用來做什麼/);
  assert.doesNotMatch(result.reply, /還有其他問題需要協助/);
});

test("chat workflow uses recent context for follow-up product answers", async () => {
  const repo = createContextRepo();
  const result = await handleChat({
    message: "1000 元以內，新手入門",
    sessionId: "context-session"
  }, { repo });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.missingProductFields.length, 0);
  assert.equal(result.recommendedProducts[0].code, "P001");
});

test("chat workflow uses previous AI product reply when customer asks for another option", async () => {
  const repo = createContextRepo({
    recentMessages: [
      { role: "customer", content: "我想找 1000 元內的新手商品" },
      {
        role: "ai",
        content: "依照您的需求，我先幫您整理幾個比較適合的選項。\n\nP001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001"
      }
    ]
  });
  const result = await handleChat({
    message: "有其他的嗎？",
    sessionId: "context-session-alt"
  }, { repo });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.classification.follow_up, "alternative");
  assert.deepEqual(result.classification.exclude_product_codes, ["P001"]);
  assert.equal(result.missingProductFields.length, 0);
  assert.ok(result.recommendedProducts.length >= 1);
  assert.notEqual(result.recommendedProducts[0].code, "P001");
  assert.doesNotMatch(result.reply, /P001｜入門保養組/);
  assert.match(result.ticket.summary, /追問其他品項/);
  assert.match(result.ticket.summary, /排除前次商品：P001/);
});

test("chat workflow uses later customer budget to refine the previous product recommendation", async () => {
  const repo = createContextRepo({
    recentMessages: [
      { role: "customer", content: "推薦商品" },
      { role: "ai", content: "請問您要用來做什麼呢？如果方便，也可以一起告訴我大約預算或想找的品類。" }
    ]
  });
  const result = await handleChat({
    message: "預算 600 元以內",
    sessionId: "context-session-budget"
  }, { repo });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.classification.follow_up, "budget_refinement");
  assert.equal(result.classification.budget, 600);
  assert.equal(result.missingProductFields.length, 0);
  assert.equal(result.recommendedProducts[0].code, "P003");
  assert.ok(result.recommendedProducts.every((product) => product.price <= 600));
});

test("chat workflow treats cheaper follow-up as a product refinement", async () => {
  const repo = createContextRepo({
    recentMessages: [
      { role: "customer", content: "我想找 1000 元內的新手商品" },
      {
        role: "ai",
        content: "P001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001"
      }
    ]
  });
  const result = await handleChat({
    message: "有沒有更便宜一點的？",
    sessionId: "context-session-cheaper"
  }, { repo });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.classification.follow_up, "cheaper");
  assert.equal(result.missingProductFields.length, 0);
  assert.notEqual(result.recommendedProducts[0].code, "P001");
  assert.ok(result.recommendedProducts[0].price < 890);
});

test("chat workflow creates needs_review ticket for human handoff", async () => {
  const result = await handleChat({
    message: "我要找真人客服",
    sessionId: "test-session-human"
  });

  assert.equal(result.classification.intent, "human_handoff");
  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.ticket.status, "needs_review");
  assert.equal(result.reply, "請稍後，客服人員將很快為您服務。");
  assert.match(result.ticket.summary, /客服摘要/);
  assert.match(result.ticket.summary, /轉人工/);
  assert.match(result.decision.handoffReason, /真人客服/);
});

test("chat workflow asks for required return information before handoff", async () => {
  const result = await handleChat({
    message: "我要退貨",
    sessionId: "test-session-return-missing"
  });

  assert.equal(result.classification.intent, "return_request");
  assert.deepEqual(result.missingReturnFields, ["delivery_no", "customer_name", "phone"]);
  assert.equal(result.decision.decision, "auto_reply");
  assert.match(result.reply, /請提供您的送貨貨號、姓名、電話號碼/);
  assert.match(result.reply, /可以上傳商品照片/);
  assert.doesNotMatch(result.reply, /還有其他問題需要協助/);
});

test("chat workflow routes return requests with required details to human review", async () => {
  const repo = createReturnContextRepo();
  const result = await handleChat({
    message: "送貨貨號 RC123456789TW，姓名王小明，電話 0912345678",
    sessionId: "return-session"
  }, { repo });

  assert.equal(result.classification.intent, "return_request");
  assert.deepEqual(result.missingReturnFields, []);
  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.ticket.status, "needs_review");
  assert.equal(result.reply, "請稍後，客服人員將很快為您服務。");
  assert.match(result.ticket.summary, /退貨資料/);
  assert.match(result.ticket.summary, /客服摘要/);
  assert.doesNotMatch(result.ticket.summary, /查詢資料/);
});

test("chat workflow records optional return photo attachments", async () => {
  const repo = createReturnContextRepo();
  const result = await handleChat({
    message: "送貨貨號 RC123456789TW，姓名王小明，電話 0912345678",
    sessionId: "return-attachment-session",
    attachments: [
      {
        name: "return-photo.jpg",
        type: "image/jpeg",
        size: 1200,
        dataUrl: "data:image/jpeg;base64,AAAA"
      }
    ]
  }, { repo });

  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.ticket.messages[0].attachments.length, 1);
  assert.match(result.ticket.summary, /附件：1 張照片/);
});

test("chat workflow asks for order identifier before checking order status", async () => {
  const result = await handleChat({
    message: "我想查貨態",
    sessionId: "test-session-order-missing"
  });

  assert.equal(result.classification.intent, "order_status");
  assert.deepEqual(result.missingOrderFields, ["order_identifier"]);
  assert.equal(result.decision.decision, "auto_reply");
  assert.match(result.reply, /訂單編號或物流單號/);
  assert.doesNotMatch(result.reply, /還有其他問題需要協助/);
});

test("chat workflow returns mock order status when order is found", async () => {
  const result = await handleChat({
    message: "請幫我查 RAC1001 的貨態",
    sessionId: "test-session-order-found"
  });

  assert.equal(result.classification.intent, "order_status");
  assert.equal(result.orderStatus.found, true);
  assert.equal(result.orderStatus.order_no, "RAC1001");
  assert.equal(result.decision.decision, "auto_reply");
  assert.match(result.reply, /配送中/);
  assert.match(result.reply, /RC123456789TW/);
});

test("chat workflow creates needs_review ticket when order status is not found", async () => {
  const result = await handleChat({
    message: "請幫我查 RAC9999 的貨態",
    sessionId: "test-session-order-miss"
  });

  assert.equal(result.classification.intent, "order_status");
  assert.equal(result.orderStatus.found, false);
  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.reply, "請稍後，客服人員將很快為您服務。");
  assert.match(result.ticket.summary, /查詢編號：RAC9999/);
});

test("conversation end message opens feedback flow only after customer says no more", async () => {
  const result = await handleChat({
    message: "沒有了",
    sessionId: "test-session-end"
  });

  assert.equal(result.conversationEnded, true);
  assert.equal(result.classification.intent, "conversation_end");
  assert.match(result.reply, /請為這次服務留下評分/);
  assert.doesNotMatch(result.reply, /還有其他問題需要協助/);
});

test("detects common no-more replies as conversation end", () => {
  assert.equal(isConversationEndMessage("沒有了"), true);
  assert.equal(isConversationEndMessage("謝謝您。"), true);
  assert.equal(isConversationEndMessage("我還有問題"), false);
});

test("uses Groq classification for fuzzy conversation-end messages", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "conversation_end",
              confidence: 0.87,
              summary: "客戶表示先結束本次對話",
              tone: "neutral",
              need_human: false,
              missing_fields: [],
              keywords: ["先這樣"]
            })
          }
        }
      ]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await handleChat({
      message: "謝謝，先這樣就好",
      sessionId: "test-session-fuzzy-end"
    }, {
      repo: createContextRepo(),
      config: {
        groqApiKey: "test-groq-key",
        classifierModel: "test-classifier",
        replyModel: "test-reply"
      }
    });

    assert.equal(isConversationEndMessage("謝謝，先這樣就好"), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, "test-classifier");
    assert.equal(result.conversationEnded, true);
    assert.equal(result.classification.intent, "conversation_end");
    assert.match(result.reply, /請為這次服務留下評分/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps order-status workflow when Groq misclassifies a clear order lookup", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "faq",
              confidence: 0.74,
              summary: "模型誤判為配送 FAQ",
              tone: "neutral",
              need_human: false,
              missing_fields: [],
              keywords: ["配送"]
            })
          }
        }
      ]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await handleChat({
      message: "我想查 RAC1001 的貨態",
      sessionId: "test-session-groq-order-guardrail"
    }, {
      config: {
        groqApiKey: "test-groq-key",
        classifierModel: "test-classifier",
        replyModel: "test-reply"
      }
    });

    assert.equal(requests.length, 1);
    assert.equal(result.classification.intent, "order_status");
    assert.equal(result.orderStatus.found, true);
    assert.match(result.reply, /配送中/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("asks for order identifier when Groq misclassifies a bare order-status request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: "out_of_scope",
              confidence: 0.62,
              summary: "模型誤判為範圍外問題",
              tone: "neutral",
              need_human: false,
              missing_fields: [],
              keywords: []
            })
          }
        }
      ]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const result = await handleChat({
      message: "我想查貨態",
      sessionId: "test-session-groq-bare-order-guardrail"
    }, {
      config: {
        groqApiKey: "test-groq-key",
        classifierModel: "test-classifier",
        replyModel: "test-reply"
      }
    });

    assert.equal(result.classification.intent, "order_status");
    assert.deepEqual(result.missingOrderFields, ["order_identifier"]);
    assert.match(result.reply, /訂單編號或物流單號/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createContextRepo({ recentMessages = null, productOverrides = null } = {}) {
  const tickets = [];
  const messages = [];
  const decisions = [];
  const products = productOverrides || [
    {
      code: "P001",
      name_zh: "入門保養組",
      name_original: "Raccoon Starter Care Kit",
      category: "保養",
      price: 890,
      image_url: "/assets/p001.png",
      product_url: "/products/P001",
      description_zh: "適合新手的基礎保養組合。",
      tags: ["新手", "預算友善"],
      use_cases: ["新手入門"],
      stock_status: "現貨"
    },
    {
      code: "P002",
      name_zh: "行動辦公耳機",
      name_original: "Raccoon Focus Buds",
      category: "3C",
      price: 1680,
      image_url: "/assets/p002.png",
      product_url: "/products/P002",
      description_zh: "適合通勤與遠距會議的輕量耳機。",
      tags: ["通勤", "遠距會議", "工作", "3C"],
      use_cases: ["工作", "通勤", "線上會議"],
      stock_status: "現貨"
    },
    {
      code: "P003",
      name_zh: "高效清潔組",
      name_original: "Raccoon Home Clean Set",
      category: "生活用品",
      price: 520,
      image_url: "/assets/p003.png",
      product_url: "/products/P003",
      description_zh: "小空間與租屋族適用的清潔組合。",
      tags: ["租屋", "清潔", "預算友善", "居家"],
      use_cases: ["居家清潔", "租屋生活", "日常使用"],
      stock_status: "有庫存"
    },
    {
      code: "P004",
      name_zh: "質感禮品杯",
      name_original: "Raccoon Daily Mug",
      category: "生活用品",
      price: 680,
      image_url: "/assets/p004.png",
      product_url: "/products/P004",
      description_zh: "適合辦公室與日常使用的質感馬克杯。",
      tags: ["送禮", "辦公室", "日常", "預算友善"],
      use_cases: ["送禮", "辦公室", "日常使用"],
      stock_status: "少量庫存"
    }
  ];

  return {
    mode: "test",
    async listFaqArticles() {
      return [];
    },
    async listProducts() {
      return products;
    },
    async listRecentMessages() {
      return recentMessages || [
        { role: "customer", content: "推薦商品" },
        { role: "ai", content: "請您再補充預算和用途或使用情境。" }
      ];
    },
    async createTicket(ticket) {
      const record = { id: `ticket-${tickets.length + 1}`, ...ticket };
      tickets.push(record);
      return record;
    },
    async createMessage(message) {
      const record = { id: `message-${messages.length + 1}`, ...message };
      messages.push(record);
      return record;
    },
    async createAiDecision(decision) {
      const record = { id: `decision-${decisions.length + 1}`, ...decision };
      decisions.push(record);
      return record;
    }
  };
}

function createReturnContextRepo() {
  const repo = createContextRepo();
  return {
    ...repo,
    async listRecentMessages() {
      return [
        { role: "customer", content: "我要退貨" },
        { role: "ai", content: "請提供您的送貨貨號、姓名、電話號碼。" }
      ];
    }
  };
}
