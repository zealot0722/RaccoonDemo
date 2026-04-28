import test from "node:test";
import assert from "node:assert/strict";

import { findBestFaq } from "../src/server/faq.js";

const faqs = [
  {
    code: "F001",
    title: "退換貨政策",
    keywords: ["退貨", "換貨", "七天"],
    answer: "商品到貨後七天內可申請退換貨。"
  },
  {
    code: "F002",
    title: "付款方式",
    keywords: ["付款", "刷卡", "轉帳"],
    answer: "支援信用卡與轉帳。"
  }
];

test("matches FAQ by Chinese keywords", () => {
  const faq = findBestFaq(faqs, "請問可以退貨嗎？");

  assert.equal(faq.code, "F001");
  assert.equal(faq.title, "退換貨政策");
});

test("returns null when no FAQ is relevant", () => {
  const faq = findBestFaq(faqs, "請幫我寫履歷");

  assert.equal(faq, null);
});
