export function getConfig() {
  return {
    groqApiKey: process.env.GROQ_API_KEY || "",
    classifierModel: process.env.GROQ_CLASSIFIER_MODEL || "llama-3.1-8b-instant",
    replyModel: process.env.GROQ_REPLY_MODEL || "llama-3.1-8b-instant",
    supabaseUrl: trimTrailingSlash(process.env.SUPABASE_URL || ""),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    adminPassword: process.env.ADMIN_PASSWORD || "",
    demoAccessCode: process.env.DEMO_ACCESS_CODE || "",
    demoFallback: process.env.DEMO_FALLBACK === "true"
  };
}

export function hasGroqConfig(config = getConfig()) {
  return Boolean(config.groqApiKey);
}

export function hasSupabaseConfig(config = getConfig()) {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
