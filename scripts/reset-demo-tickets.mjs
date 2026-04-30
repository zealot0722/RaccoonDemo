import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { demoAiDecisions, demoMessages, demoTickets } from "../src/server/demo-ticket-fixtures.js";

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const confirmed = process.env.CONFIRM_RESET_DEMO_TICKETS === "YES";

if (!confirmed) {
  console.error("Refusing to reset tickets. Set CONFIRM_RESET_DEMO_TICKETS=YES to continue.");
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

await supabaseRequest("tickets?id=not.is.null", { method: "DELETE", prefer: "return=minimal" });
await supabaseRequest("tickets", { method: "POST", body: demoTickets });
await supabaseRequest("messages", { method: "POST", body: demoMessages });
await supabaseRequest("ai_decisions", { method: "POST", body: demoAiDecisions });

console.log(`Reset complete. Seeded ${demoTickets.length} tickets, ${demoMessages.length} messages, ${demoAiDecisions.length} decisions.`);

async function supabaseRequest(endpoint, { method = "GET", body, prefer = "return=representation" } = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${endpoint}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${method} ${endpoint} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
