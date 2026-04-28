import test from "node:test";
import assert from "node:assert/strict";

import { handleChat } from "../src/server/chat-service.js";

test("chat workflow recommends product cards for a concrete request", async () => {
  const result = await handleChat({
    message: "我想找 1000 元內的新手商品",
    sessionId: "test-session"
  });

  assert.equal(result.classification.intent, "product_recommendation");
  assert.equal(result.decision.decision, "auto_reply");
  assert.ok(result.recommendedProducts.length >= 1);
  assert.equal(result.recommendedProducts[0].code, "P001");
  assert.equal(result.ticket.status, "auto_replied");
});

test("chat workflow creates needs_review ticket for human handoff", async () => {
  const result = await handleChat({
    message: "我要找真人客服",
    sessionId: "test-session"
  });

  assert.equal(result.classification.intent, "human_handoff");
  assert.equal(result.decision.decision, "needs_review");
  assert.equal(result.ticket.status, "needs_review");
  assert.match(result.decision.handoffReason, /真人客服/);
});
