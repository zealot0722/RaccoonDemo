import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("mobile quick actions stay visible without horizontal-only scrolling", () => {
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.quick-actions\s*\{[\s\S]*display: grid;/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /@media \(max-width: 560px\)[\s\S]*\.quick-actions\s*\{[\s\S]*overflow-x: auto/);
});

test("customer chat keeps a bounded scroll area instead of stretching the page", () => {
  assert.match(css, /\.chat-shell\s*\{[\s\S]*height: clamp\(560px, calc\(100vh - 150px\), 760px\);/);
  assert.match(css, /\.chat-shell\s*\{[\s\S]*grid-template-rows: auto auto minmax\(240px, 1fr\) auto auto;/);
  assert.match(css, /\.messages\s*\{[\s\S]*overflow-y: auto;/);
  assert.match(css, /\.messages\s*\{[\s\S]*min-height: 0;/);
});

test("chat bubbles fit their text instead of stretching across the message column", () => {
  assert.match(css, /\.messages\s*\{[\s\S]*align-items: flex-start;/);
  assert.match(css, /\.message\s*\{[\s\S]*display: grid;/);
  assert.match(css, /\.message\s*\{[\s\S]*width: max-content;/);
  assert.match(css, /\.message\s*\{[\s\S]*min-height: 0;/);
  assert.match(css, /\.message\s*\{[\s\S]*flex-shrink: 0;/);
  assert.match(css, /\.message\.customer\s*\{[\s\S]*align-self: flex-end;/);
  assert.match(css, /\.message\.ai,\s*\n\.message\.system\s*\{[\s\S]*align-self: flex-start;/);
  assert.match(css, /\.message-content\s*\{[\s\S]*padding: 9px 12px;/);
  assert.match(css, /\.message-content\s*\{[\s\S]*white-space: pre-line;/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.message\s*\{[\s\S]*width: fit-content;/);
});
