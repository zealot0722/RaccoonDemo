import { decideNextAction } from "./decision.js";
import { findBestFaq } from "./faq.js";
import { classifyMessage, generateReply } from "./llm.js";
import { formatAssistantReply } from "./reply-format.js";
import {
  formatMissingProductFields,
  getMissingProductFields,
  recommendProducts
} from "./recommendation.js";
import { createRepository, generateTicketNo } from "./repository.js";

export async function handleChat({ message, sessionId }, options = {}) {
  const repo = options.repo || createRepository(options.config);
  const cleanMessage = String(message || "").trim();

  if (!cleanMessage) {
    const error = new Error("message is required");
    error.statusCode = 400;
    throw error;
  }

  const [faqArticles, products] = await Promise.all([
    repo.listFaqArticles(),
    repo.listProducts()
  ]);

  const classification = await classifyMessage(cleanMessage, { config: options.config });
  const missingProductFields = getMissingProductFields(classification);
  const matchedFaq = classification.intent === "faq"
    ? findBestFaq(faqArticles, cleanMessage)
    : null;
  const recommendedProducts = classification.intent === "product_recommendation" &&
    missingProductFields.length === 0
    ? recommendProducts(products, classification)
    : [];

  const decision = decideNextAction({
    classification,
    matchedFaq,
    recommendedProducts,
    missingProductFields,
    replyGenerationOk: true
  });

  const reply = formatAssistantReply(await buildReply({
    message: cleanMessage,
    classification,
    matchedFaq,
    recommendedProducts,
    decision,
    missingProductFields,
    config: options.config
  }));

  const ticket = await repo.createTicket({
    ticket_no: generateTicketNo(),
    customer_id: sessionId || "web-demo",
    status: decision.decision === "needs_review" ? "needs_review" : "auto_replied",
    summary: classification.summary || cleanMessage.slice(0, 120),
    intent: classification.intent,
    priority: decision.riskFlags.includes("angry_tone") ? "high" : "normal",
    handoff_reason: decision.handoffReason
  });

  const customerMessage = await repo.createMessage({
    ticket_id: ticket.id,
    role: "customer",
    content: cleanMessage
  });
  const aiMessage = await repo.createMessage({
    ticket_id: ticket.id,
    role: decision.decision === "needs_review" ? "system" : "ai",
    content: reply
  });
  const aiDecision = await repo.createAiDecision({
    ticket_id: ticket.id,
    intent: classification.intent,
    confidence: classification.confidence,
    tone: classification.tone,
    decision: decision.decision,
    reasons: decision.reasons,
    risk_flags: decision.riskFlags,
    matched_faq_code: matchedFaq?.code || null,
    recommended_product_codes: recommendedProducts.map((product) => product.code),
    handoff_reason: decision.handoffReason,
    raw_classification: classification
  });

  return {
    reply,
    ticket: {
      ...ticket,
      messages: [customerMessage, aiMessage],
      ai_decision: aiDecision
    },
    classification,
    decision,
    matchedFaq,
    recommendedProducts,
    missingProductFields,
    mode: repo.mode
  };
}

async function buildReply({
  message,
  classification,
  matchedFaq,
  recommendedProducts,
  decision,
  missingProductFields,
  config
}) {
  if (decision.decision === "needs_review") {
    return "我已經幫你建立待處理工單，真人客服會接手確認。你也可以補充更多細節，讓客服更快處理。";
  }

  if (classification.intent === "product_recommendation" && missingProductFields.length > 0) {
    return `我可以幫你推薦商品。請再補充${formatMissingProductFields(missingProductFields)}，例如「1000 元內、送禮」或「新手入門」。`;
  }

  if (classification.intent === "out_of_scope") {
    return "這個問題超出目前 Raccoon demo 的服務範圍。你可以詢問退換貨、付款、配送、保固，或請我推薦商品。";
  }

  return generateReply({
    message,
    classification,
    matchedFaq,
    recommendedProducts
  }, { config });
}
