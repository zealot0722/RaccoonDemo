import test from "node:test";
import assert from "node:assert/strict";

import { handleChat } from "../src/server/chat-service.js";
import { demoFaqArticles, demoOrderStatuses, demoProducts } from "../src/server/demo-data.js";

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

const returnContext = [
  { role: "customer", content: "我要退貨" },
  { role: "ai", content: "請提供您的送貨貨號、姓名、電話號碼。" }
];

const resolvedContext = [
  { role: "customer", content: "我想查貨態" },
  { role: "ai", content: "可以，我幫您查貨態。\n請問您方便提供訂單編號或物流單號嗎？" }
];

const rounds = [
  [
    faq("退貨期限大概怎麼算", "F001"),
    product("我想找 1000 元內的新手入門商品", "P001"),
    productMissing("幫我推薦商品"),
    productFollowUp("還有其他的嗎", singleProductContext),
    orderFound("RAC1004的東西在哪", "RAC1004"),
    orderMissing("我的包裹到哪了"),
    returnMissing("我要退貨"),
    returnReady("王小明 0912345678 RC123456789TW"),
    human("我要找真人客服"),
    complaint("你們服務太差了"),
    chitchat("哈囉"),
    unclear("123123123"),
    unclear("?"),
    ended("沒有了"),
    multiIntent("我要退貨，順便查 RAC1001 到哪")
  ],
  [
    faq("付款能刷卡嗎", "F002"),
    product("兩千以內通勤用 3C 商品", "P002"),
    productMissing("我想看產品但沒想法"),
    productFollowUp("便宜一點的有嗎", singleProductContext),
    orderFound("幫我看 RAC1001 到哪了", "RAC1001"),
    orderMissing("物流進度能查嗎"),
    returnMissing("收到商品破損了"),
    returnReady("送貨貨號RC123456789TW 姓名林小美 電話0987654321"),
    human("可以轉人工嗎"),
    complaint("我真的很不爽"),
    chitchat("你好"),
    unclear("asdfasdf"),
    unclear("？"),
    ended("不用了"),
    multiIntent("幫我推薦耳機，也查一下 RAC1004")
  ],
  [
    faq("配送通常幾天會到", "F003"),
    product("700 左右送禮用的東西", "P004"),
    productMissing("商品可以幫我挑一下嗎"),
    productFollowUp("那改成 2000 以下", singleProductContext),
    orderFound("RC987654321TW 送到了嗎", "RAC1002"),
    orderMissing("想知道貨態"),
    returnMissing("東西壞掉想換貨"),
    returnReady("我是陳大同，電話0911111111，貨號RC987654321TW"),
    human("請專人協助我"),
    complaint("這次處理很爛"),
    chitchat("在嗎"),
    unclear("zzzzzz"),
    unclear("??"),
    ended("先這樣"),
    multiIntent("我要找真人，順便問保固")
  ],
  [
    faq("保固維修是一年嗎", "F004"),
    product("600 以下租屋清潔用品", "P003"),
    productMissing("有沒有適合入門的東西"),
    productFollowUp("第二個有現貨嗎", multiProductContext, "P002"),
    orderFound("訂單 RAC1002 現在狀態", "RAC1002"),
    orderMissing("怎麼還沒到"),
    returnMissing("包裹少件要處理"),
    returnReady("貨號 RC555666777TW，姓名吳小安，電話 0922222222"),
    human("我想找人處理"),
    complaint("客服態度很糟"),
    chitchat("hello"),
    unclear("??????"),
    unclear("???"),
    ended("沒問題"),
    multiIntent("商品壞掉想退，請人工客服接手")
  ],
  [
    faq("換貨流程可以先說明嗎", "F001"),
    product("辦公室用的杯子 1000 內", "P004"),
    productMissing("想買商品，還沒有預算和用途"),
    productFollowUp("我不要耳機，換生活用品", multiProductContext),
    orderFound("包裹 RC555666777TW 目前位置", "RAC1004"),
    orderMissing("可以看配送進度嗎"),
    returnMissing("商品不能用想退款"),
    returnReady("姓名張小華 電話0933333333 送貨貨號RC123456789TW"),
    human("幫我聯絡客服"),
    complaint("我要客訴"),
    chitchat("嗨"),
    unclear("0000000"),
    unclear("   ?   "),
    ended("謝謝"),
    multiIntent("付款方式和配送進度都想問")
  ]
];

test("fuzzy semantic questions are unique across all five rounds", () => {
  const messages = rounds.flat().map((item) => item.message);
  assert.equal(new Set(messages).size, messages.length);
});

for (const [roundIndex, cases] of rounds.entries()) {
  test(`fuzzy semantic round ${roundIndex + 1}`, async () => {
    for (const item of cases) {
      const result = await handleChat({
        message: item.message,
        sessionId: `fuzzy-round-${roundIndex + 1}-${item.kind}`
      }, {
        repo: createRepo(item.history || resolvedContext)
      });

      assertExpectation(item, result);
    }
  });
}

function faq(message, expectedFaqCode) {
  return { kind: "faq", message, expectedFaqCode };
}

function product(message, expectedProductCode) {
  return { kind: "product", message, expectedProductCode };
}

function productMissing(message) {
  return { kind: "productMissing", message };
}

function productFollowUp(message, history, expectedProductCode = "") {
  return { kind: "productFollowUp", message, history, expectedProductCode };
}

function orderFound(message, expectedOrderNo) {
  return { kind: "orderFound", message, expectedOrderNo };
}

function orderMissing(message) {
  return { kind: "orderMissing", message };
}

function returnMissing(message) {
  return { kind: "returnMissing", message };
}

function returnReady(message) {
  return { kind: "returnReady", message, history: returnContext };
}

function human(message) {
  return { kind: "human", message };
}

function complaint(message) {
  return { kind: "complaint", message };
}

function chitchat(message) {
  return { kind: "chitchat", message };
}

function unclear(message) {
  return { kind: "unclear", message };
}

function ended(message) {
  return { kind: "ended", message };
}

function multiIntent(message) {
  return { kind: "multiIntent", message };
}

function assertExpectation(item, result) {
  switch (item.kind) {
    case "faq":
      assert.equal(result.classification.intent, "faq", item.message);
      assert.equal(result.matchedFaq?.code, item.expectedFaqCode, item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "product":
      assert.equal(result.classification.intent, "product_recommendation", item.message);
      assert.equal(result.recommendedProducts[0]?.code, item.expectedProductCode, item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "productMissing":
      assert.equal(result.classification.intent, "product_recommendation", item.message);
      assert.ok(result.missingProductFields.length > 0, item.message);
      assert.equal(result.recommendedProducts.length, 0, item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "productFollowUp":
      assert.equal(result.classification.intent, "product_recommendation", item.message);
      assert.ok(result.recommendedProducts.length > 0, item.message);
      if (item.expectedProductCode) {
        assert.equal(result.recommendedProducts[0]?.code, item.expectedProductCode, item.message);
      }
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "orderFound":
      assert.equal(result.classification.intent, "order_status", item.message);
      assert.equal(result.orderStatus?.found, true, item.message);
      assert.equal(result.orderStatus?.order_no, item.expectedOrderNo, item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "orderMissing":
      assert.equal(result.classification.intent, "order_status", item.message);
      assert.deepEqual(result.missingOrderFields, ["order_identifier"], item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "returnMissing":
      assert.equal(result.classification.intent, "return_request", item.message);
      assert.ok(result.missingReturnFields.length > 0, item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "returnReady":
      assert.equal(result.classification.intent, "return_request", item.message);
      assert.deepEqual(result.missingReturnFields, [], item.message);
      assert.equal(result.decision.decision, "needs_review", item.message);
      break;
    case "human":
      assert.equal(result.classification.intent, "human_handoff", item.message);
      assert.equal(result.decision.decision, "needs_review", item.message);
      break;
    case "complaint":
      assert.equal(result.classification.intent, "complaint", item.message);
      assert.equal(result.decision.decision, "needs_review", item.message);
      break;
    case "chitchat":
      assert.equal(result.classification.intent, "chitchat", item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      break;
    case "unclear":
      assert.equal(result.classification.intent, "unclear", item.message);
      assert.equal(result.decision.decision, "auto_reply", item.message);
      assert.equal(result.recommendedProducts.length, 0, item.message);
      break;
    case "ended":
      assert.equal(result.classification.intent, "conversation_end", item.message);
      assert.equal(result.conversationEnded, true, item.message);
      break;
    case "multiIntent":
      assert.ok(result.classification.multi_intent?.length > 1, item.message);
      if (result.classification.multi_intent.includes("human_handoff")) {
        assert.equal(result.decision.decision, "needs_review", item.message);
      } else {
        assert.equal(result.decision.decision, "auto_reply", item.message);
      }
      break;
    default:
      throw new Error(`Unknown fuzzy semantic case kind: ${item.kind}`);
  }
}

function createRepo(recentMessages = []) {
  const tickets = [];
  const messages = [];
  const decisions = [];

  return {
    mode: "fuzzy-test",
    async listFaqArticles() {
      return demoFaqArticles;
    },
    async listProducts() {
      return demoProducts;
    },
    async listRecentMessages() {
      return recentMessages;
    },
    async findOrderStatus({ orderNo, trackingNo } = {}) {
      const normalizedOrderNo = normalizeIdentifier(orderNo);
      const normalizedTrackingNo = normalizeIdentifier(trackingNo);
      const record = demoOrderStatuses.find((item) => {
        return normalizeIdentifier(item.order_no) === normalizedOrderNo ||
          normalizeIdentifier(item.tracking_no) === normalizedTrackingNo;
      });

      if (!record) {
        return {
          found: false,
          order_no: normalizedOrderNo,
          tracking_no: normalizedTrackingNo
        };
      }

      return {
        found: true,
        ...record
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

function normalizeIdentifier(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}
