import test from "node:test";
import assert from "node:assert/strict";

import { isAccessAllowed, requireAccess } from "../src/server/auth.js";

test("allows requests when no demo access code is configured", () => {
  assert.equal(isAccessAllowed("", { demoAccessCode: "" }), true);
});

test("requires matching demo access code when configured", () => {
  const config = { demoAccessCode: "raccoon2026" };

  assert.equal(isAccessAllowed("wrong", config), false);
  assert.equal(isAccessAllowed("raccoon2026", config), true);
});

test("throws 401 for invalid demo access code", () => {
  assert.throws(
    () => requireAccess("wrong", { demoAccessCode: "raccoon2026" }),
    (error) => error.statusCode === 401
  );
});
