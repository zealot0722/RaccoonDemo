import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("mobile quick actions stay visible without horizontal-only scrolling", () => {
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.quick-actions\s*\{[\s\S]*display: grid;/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /@media \(max-width: 560px\)[\s\S]*\.quick-actions\s*\{[\s\S]*overflow-x: auto/);
});
