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
  assert.match(result.reply, /請您再補充預算和用途或使用情境/);
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

test("chat workflow creates needs_review ticket for human handoff", async () => {
  const result = await handleChat({
    message: "我要找真人客服",
    sessionId: "test-session-human"
  });

  assert.equal(result.classification.intent, "human_handoff");
  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.ticket.status, "needs_review");
  assert.match(result.decision.handoffReason, /真人客服/);
});

test("conversation end message opens feedback flow only after customer says no more", async () => {
  const result = await handleChat({
    message: "沒有了",
    sessionId: "test-session-end"
  });

  assert.equal(result.conversationEnded, true);
  assert.equal(result.classification.intent, "conversation_end");
  assert.match(result.reply, /請為本次服務評分/);
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
    assert.match(result.reply, /請為本次服務評分/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createContextRepo() {
  const tickets = [];
  const messages = [];
  const decisions = [];
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
      tags: ["新手", "預算友善"],
      use_cases: ["新手入門"],
      stock_status: "現貨"
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
      return [
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
