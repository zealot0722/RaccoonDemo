import test from "node:test";
import assert from "node:assert/strict";

import { formatAssistantReply } from "../src/server/reply-format.js";

test("removes markdown bold markers from assistant replies", () => {
  const result = formatAssistantReply("我推薦 **P001 入門保養組**。價格符合預算。");

  assert.equal(result.includes("**"), false);
  assert.match(result, /P001 入門保養組/);
});

test("adds line breaks after sentence punctuation", () => {
  const result = formatAssistantReply("第一句。第二句！第三句？");

  assert.equal(result, "第一句。\n第二句！\n第三句？");
});

test("keeps existing paragraph breaks compact", () => {
  const result = formatAssistantReply("第一段。\n\n\n第二段。");

  assert.equal(result, "第一段。\n\n第二段。");
});
