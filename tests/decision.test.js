import test from "node:test";
import assert from "node:assert/strict";

import { decideNextAction } from "../src/server/decision.js";

test("routes explicit human requests to needs_review", () => {
  const result = decideNextAction({
    classification: {
      intent: "human_handoff",
      confidence: 0.92,
      tone: "neutral",
      need_human: true
    },
    matchedFaq: null,
    recommendedProducts: [],
    replyGenerationOk: true
  });

  assert.equal(result.decision, "needs_review");
  assert.match(result.handoffReason, /真人客服/);
});

test("routes low-confidence FAQ misses to needs_review", () => {
  const result = decideNextAction({
    classification: {
      intent: "faq",
      confidence: 0.42,
      tone: "neutral",
      need_human: false
    },
    matchedFaq: null,
    recommendedProducts: [],
    replyGenerationOk: true
  });

  assert.equal(result.decision, "needs_review");
  assert.match(result.handoffReason, /FAQ/);
});

test("asks for missing product conditions without returning products", () => {
  const result = decideNextAction({
    classification: {
      intent: "product_recommendation",
      confidence: 0.83,
      tone: "neutral",
      need_human: false
    },
    matchedFaq: null,
    recommendedProducts: [],
    missingProductFields: ["budget", "use_case"],
    replyGenerationOk: true
  });

  assert.equal(result.decision, "auto_reply");
  assert.match(result.reasons[0], /條件不足/);
});

test("allows product recommendations when products are available", () => {
  const result = decideNextAction({
    classification: {
      intent: "product_recommendation",
      confidence: 0.83,
      tone: "neutral",
      need_human: false
    },
    matchedFaq: null,
    recommendedProducts: [{ code: "P001", name_zh: "入門保養組" }],
    replyGenerationOk: true
  });

  assert.equal(result.decision, "auto_reply");
  assert.deepEqual(result.riskFlags, []);
});
