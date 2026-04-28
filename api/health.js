import { getConfig, hasGroqConfig, hasSupabaseConfig } from "../src/server/config.js";
import { sendJson } from "../src/server/http.js";

export default function handler(req, res) {
  const config = getConfig();
  sendJson(res, 200, {
    ok: true,
    groqConfigured: hasGroqConfig(config),
    supabaseConfigured: hasSupabaseConfig(config),
    classifierModel: config.classifierModel,
    replyModel: config.replyModel,
    mode: hasSupabaseConfig(config) ? "supabase" : "memory-demo",
    accessCodeRequired: Boolean(config.demoAccessCode)
  });
}
