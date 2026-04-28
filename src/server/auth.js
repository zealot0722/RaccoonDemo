import { getConfig } from "./config.js";

export function isAccessAllowed(providedCode, config = getConfig()) {
  if (!config.demoAccessCode) return true;
  return String(providedCode || "") === config.demoAccessCode;
}

export function requireAccess(providedCode, config = getConfig()) {
  if (isAccessAllowed(providedCode, config)) return;

  const error = new Error("invalid demo access code");
  error.statusCode = 401;
  throw error;
}

export function getAccessCodeFromRequest(req, body = {}) {
  return body.accessCode || req.headers?.["x-demo-access-code"] || "";
}
