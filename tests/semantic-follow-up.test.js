import test from "node:test";
import assert from "node:assert/strict";

import { applyWorkflowRouting, handleChat } from "../src/server/chat-service.js";

const products = [
  {
    code: "P001",
    name_zh: "入門保養組",
    name_original: "Raccoon Starter Care Kit",
    category: "保養",
    price: 890,
    image_url: "/assets/p001.png",
    product_url: "/products/P001",
    description_zh: "適合新手的基礎保養組合。",
    tags: ["新手", "送禮", "預算友善"],
    use_cases: ["新手入門", "日常使用", "送禮"],
    stock_status: "有庫存"
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
    stock_status: "有庫存"
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

const singleProductContext = [
  { role: "customer", content: "我想找 2000 元內的耳機" },
  {
    role: "ai",
    content: "P002｜行動辦公耳機\n價格：NT$ 1680\n庫存：有庫存\n適合情境：工作、通勤、線上會議\n詳情連結：/products/P002"
  }
];

const multiProductContext = [
  { role: "customer", content: "我想找 2000 元內送禮或通勤用商品" },
  {
    role: "ai",
    content: [
      "P001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001",
      "P002｜行動辦公耳機\n價格：NT$ 1680\n詳情連結：/products/P002",
      "P004｜質感禮品杯\n價格：NT$ 680\n詳情連結：/products/P004"
    ].join("\n\n")
  }
];

const productBudgetPrompt = [
  { role: "customer", content: "我想找耳機" },
  { role: "ai", content: "請問您方便補充預算嗎？" }
];

const returnPrompt = [
  { role: "customer", content: "我要退貨" },
  { role: "ai", content: "請提供您的送貨貨號、姓名、電話號碼。" }
];

test("semantic follow-up guardrails resolve product pronouns and ordinals", async () => {
  const cases = [
    ["剛剛那個多少錢", singleProductContext, "P002"],
    ["這款還有現貨嗎", singleProductContext, "P002"],
    ["它適合通勤嗎", singleProductContext, "P002"],
    ["第二個多少錢", multiProductContext, "P002"],
    ["第2個可以嗎", multiProductContext, "P002"]
  ];

  for (const [message, history, expectedCode] of cases) {
    const result = await handleChat({ message, sessionId: `product-reference-${message}` }, {
      repo: createRepo(history)
    });
    assert.equal(result.classification.intent, "product_recommendation", message);
    assert.equal(result.recommendedProducts[0]?.code, expectedCode, message);
    assert.notEqual(result.classification.budget, 2, message);
  }
});

test("semantic follow-up guardrails parse budget ranges by upper bound", async () => {
  const cases = [
    "1000 到 2000",
    "一千到兩千",
    "1000-2000",
    "1-2k",
    "一千以上兩千以下"
  ];

  for (const message of cases) {
    const result = await handleChat({ message, sessionId: `budget-range-${message}` }, {
      repo: createRepo(productBudgetPrompt)
    });
    assert.equal(result.classification.intent, "product_recommendation", message);
    assert.equal(result.classification.budget, 2000, message);
    assert.equal(result.recommendedProducts[0]?.code, "P002", message);
  }
});

test("semantic follow-up guardrails keep delivery timing questions as FAQ", () => {
  const result = applyWorkflowRouting({
    intent: "order_status",
    confidence: 0.51,
    tone: "neutral",
    need_human: false,
    summary: "客戶詢問配送",
    missing_fields: ["order_identifier"]
  }, "配送通常幾天會到", []);

  assert.equal(result.intent, "faq");
  assert.deepEqual(result.missing_fields, []);
  assert.equal(result.order_no, "");
  assert.equal(result.tracking_no, "");
});

test("semantic follow-up guardrails accumulate natural return details", async () => {
  const completeCases = [
    "王小明 0912345678 RC123456789TW",
    "退貨資料：王小明，0912345678，RC123456789TW"
  ];

  for (const message of completeCases) {
    const result = await handleChat({ message, sessionId: `return-complete-${message}` }, {
      repo: createRepo(returnPrompt)
    });
    assert.equal(result.classification.intent, "return_request", message);
    assert.deepEqual(result.missingReturnFields, [], message);
    assert.equal(result.decision.decision, "needs_review", message);
  }

  const bareIdentifier = await handleChat({
    message: "只有這個 RC123456789TW",
    sessionId: "return-bare-identifier"
  }, {
    repo: createRepo(returnPrompt)
  });
  assert.equal(bareIdentifier.classification.intent, "return_request");
  assert.deepEqual(bareIdentifier.missingReturnFields, ["customer_name", "phone"]);

  const phoneOnly = await handleChat({
    message: "電話 0912345678",
    sessionId: "return-phone-only"
  }, {
    repo: createRepo(returnPrompt)
  });
  assert.equal(phoneOnly.classification.intent, "return_request");
  assert.deepEqual(phoneOnly.missingReturnFields, ["delivery_no", "customer_name"]);

  const accumulated = await handleChat({
    message: "姓名王小明",
    sessionId: "return-accumulated"
  }, {
    repo: createRepo([
      ...returnPrompt,
      { role: "customer", content: "貨號 RC123456789TW" },
      { role: "ai", content: "還缺姓名、電話號碼。" },
      { role: "customer", content: "電話 0912345678" },
      { role: "ai", content: "還缺姓名。" }
    ])
  });
  assert.equal(accumulated.classification.intent, "return_request");
  assert.deepEqual(accumulated.missingReturnFields, []);
  assert.equal(accumulated.decision.decision, "needs_review");
});

test("semantic follow-up guardrails route generic customer-service wording by task", async () => {
  const product = await handleChat({
    message: "我想找客服幫我推薦商品",
    sessionId: "cs-product"
  }, {
    repo: createRepo([])
  });
  assert.equal(product.classification.intent, "product_recommendation");
  assert.notEqual(product.decision.decision, "needs_review");

  const order = await handleChat({
    message: "找客服查貨態",
    sessionId: "cs-order"
  }, {
    repo: createRepo([])
  });
  assert.equal(order.classification.intent, "order_status");
  assert.deepEqual(order.missingOrderFields, ["order_identifier"]);

  const foundOrder = await handleChat({
    message: "客服可以幫我查 RAC1001 嗎",
    sessionId: "cs-order-found"
  }, {
    repo: createRepo([])
  });
  assert.equal(foundOrder.classification.intent, "order_status");
  assert.equal(foundOrder.orderStatus.found, true);

  const returnRequest = await handleChat({
    message: "客服幫我退貨",
    sessionId: "cs-return"
  }, {
    repo: createRepo([])
  });
  assert.equal(returnRequest.classification.intent, "return_request");

  const human = await handleChat({
    message: "我要找真人客服",
    sessionId: "cs-human"
  }, {
    repo: createRepo([])
  });
  assert.equal(human.classification.intent, "human_handoff");
  assert.equal(human.decision.decision, "needs_review");
});

test("semantic follow-up guardrails apply negative product preferences", async () => {
  const cases = [
    ["不要耳機，有沒有杯子", singleProductContext, "P004", ["P002"]],
    [
      "不要保養，送禮用",
      [
        { role: "customer", content: "我想找 1000 元內的新手商品" },
        { role: "ai", content: "P001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001" }
      ],
      "P004",
      ["P001"]
    ],
    ["不要這款，換杯子", singleProductContext, "P004", ["P002"]],
    ["我不想要3C，想送禮", singleProductContext, "P004", ["P002"]],
    [
      "排除清潔，有沒有日常的",
      [
        { role: "customer", content: "我想找清潔用品" },
        { role: "ai", content: "P003｜高效清潔組\n價格：NT$ 520\n詳情連結：/products/P003" }
      ],
      "P004",
      ["P003"]
    ]
  ];

  for (const [message, history, expectedFirstCode, excludedCodes] of cases) {
    const result = await handleChat({ message, sessionId: `negative-${message}` }, {
      repo: createRepo(history)
    });
    assert.equal(result.classification.intent, "product_recommendation", message);
    assert.equal(result.recommendedProducts[0]?.code, expectedFirstCode, message);
    for (const code of excludedCodes) {
      assert.equal(result.recommendedProducts.some((product) => product.code === code), false, message);
    }
  }
});

test("semantic follow-up guardrails surface multi-intent messages for review", async () => {
  const cases = [
    ["我要退貨，順便查 RAC1001 貨態", ["退貨", "貨態", "RAC1001"]],
    ["我想先查貨態，但收到壞掉也想退", ["退貨", "貨態"]],
    ["請查 RAC1001，然後我也要退貨", ["退貨", "RAC1001"]],
    ["商品壞掉了，也想問保固", ["退貨", "保固"]],
    ["先推薦耳機，另外我要找真人", ["推薦", "耳機", "真人"]]
  ];

  for (const [message, expectedSummaryParts] of cases) {
    const result = await handleChat({ message, sessionId: `multi-intent-${message}` }, {
      repo: createRepo([])
    });
    assert.equal(result.decision.decision, "needs_review", message);
    for (const part of expectedSummaryParts) {
      assert.match(result.ticket.summary, new RegExp(part), message);
    }
  }
});

test("order-status requests keep priority over product context", async () => {
  const productContext = [
    { role: "customer", content: "我想找 2000 元內的耳機" },
    {
      role: "ai",
      content: "P002｜行動辦公耳機\n價格：NT$ 1680\n庫存：有庫存\n詳情連結：/products/P002"
    }
  ];

  const cases = [
    ["我想查貨態", false],
    ["幫我查 RAC1001", true],
    ["查一下 RC123456789TW", true],
    ["我的包裹在哪", false],
    ["怎麼還沒到", false]
  ];

  for (const [message, shouldFindOrder] of cases) {
    const result = await handleChat({ message, sessionId: `order-over-product-${message}` }, {
      repo: createRepo(productContext)
    });
    assert.equal(result.classification.intent, "order_status", message);
    assert.deepEqual(result.recommendedProducts, [], message);
    if (shouldFindOrder) {
      assert.equal(result.orderStatus.found, true, message);
    } else {
      assert.deepEqual(result.missingOrderFields, ["order_identifier"], message);
    }
  }
});

test("product stock questions remain product follow-ups instead of order-status lookups", async () => {
  const productContext = [
    { role: "customer", content: "我想找 2000 元內的耳機" },
    {
      role: "ai",
      content: "P002｜行動辦公耳機\n價格：NT$ 1680\n庫存：有庫存\n詳情連結：/products/P002"
    }
  ];
  const multiProductContext = [
    { role: "customer", content: "我想找 2000 元內送禮或通勤用商品" },
    {
      role: "ai",
      content: [
        "P001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001",
        "P002｜行動辦公耳機\n價格：NT$ 1680\n庫存：有庫存\n詳情連結：/products/P002"
      ].join("\n\n")
    }
  ];

  const stock = await handleChat({
    message: "這款有庫存嗎",
    sessionId: "product-stock-boundary"
  }, {
    repo: createRepo(productContext)
  });
  assert.equal(stock.classification.intent, "product_recommendation");
  assert.equal(stock.recommendedProducts[0]?.code, "P002");
  assert.equal(stock.orderStatus, null);

  const available = await handleChat({
    message: "第二個有貨嗎",
    sessionId: "product-available-boundary"
  }, {
    repo: createRepo(multiProductContext)
  });
  assert.equal(available.classification.intent, "product_recommendation");
  assert.equal(available.recommendedProducts[0]?.code, "P002");
  assert.equal(available.orderStatus, null);
});

test("bare order identifiers only resolve inside order-status context", async () => {
  const orderContext = [
    { role: "customer", content: "我想查貨態" },
    { role: "ai", content: "可以，我幫您查貨態。\n請問您方便提供訂單編號或物流單號嗎？" }
  ];
  const productContext = [
    { role: "customer", content: "我想找 2000 元內的耳機" },
    {
      role: "ai",
      content: "P002｜行動辦公耳機\n價格：NT$ 1680\n庫存：有庫存\n詳情連結：/products/P002"
    }
  ];

  const orderResult = await handleChat({
    message: "RAC1001",
    sessionId: "bare-order-id-context"
  }, {
    repo: createRepo(orderContext)
  });
  assert.equal(orderResult.classification.intent, "order_status");
  assert.equal(orderResult.orderStatus.found, true);

  const productResult = await handleChat({
    message: "RAC1001",
    sessionId: "bare-product-id-context"
  }, {
    repo: createRepo(productContext)
  });
  assert.notEqual(productResult.classification.intent, "product_recommendation");
  assert.equal(productResult.recommendedProducts.length, 0);
});

function createRepo(recentMessages = []) {
  const tickets = [];
  const messages = [];
  const decisions = [];

  return {
    mode: "test",
    async listFaqArticles() {
      return [];
    },
    async listProducts() {
      return products;
    },
    async listRecentMessages() {
      return recentMessages;
    },
    async findOrderStatus({ orderNo, trackingNo } = {}) {
      if (orderNo === "RAC1001" || trackingNo === "RC123456789TW") {
        return {
          found: true,
          order_no: "RAC1001",
          tracking_no: "RC123456789TW",
          status: "in_transit",
          status_label: "配送中",
          current_location: "桃園轉運中心"
        };
      }

      return {
        found: false,
        order_no: orderNo || "",
        tracking_no: trackingNo || ""
      };
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
