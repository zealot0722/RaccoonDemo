import test from "node:test";
import assert from "node:assert/strict";

import { formatAssistantReply } from "../src/server/reply-format.js";

test("removes markdown bold markers from assistant replies", () => {
  const result = formatAssistantReply("推薦 **P001 入門保養組**，適合新手。");

  assert.equal(result.includes("**"), false);
  assert.match(result, /P001 入門保養組/);
});

test("adds line breaks after sentence punctuation", () => {
  const result = formatAssistantReply("您好。請補充預算。謝謝您！");

  assert.equal(result, "您好。\n請補充預算。\n謝謝您！");
});

test("keeps existing paragraph breaks compact", () => {
  const result = formatAssistantReply("第一段。\n\n\n第二段。");

  assert.equal(result, "第一段。\n\n第二段。");
});

test("uses 您 for customer-facing second-person pronouns", () => {
  const result = formatAssistantReply("你可以補充預算，你們也可以直接找客服。");

  assert.equal(result, "您可以補充預算，您也可以直接找客服。");
});
