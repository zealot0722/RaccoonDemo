const HANDOFF_TEXT = {
  human_handoff: "使用者明確要求真人客服，建立待處理工單。",
  complaint: "偵測到客訴或負面情緒，轉交真人客服處理。",
  angry: "偵測到憤怒語氣，轉交真人客服避免誤判。",
  low_confidence: "AI 信心度低於門檻，轉交真人客服確認。",
  faq_miss: "FAQ 查無明確答案且信心度偏低，轉交真人客服確認。",
  generation_error: "AI 回覆生成失敗，轉交真人客服處理。"
};

export function decideNextAction({
  classification,
  matchedFaq,
  recommendedProducts = [],
  replyGenerationOk = true,
  missingProductFields = []
}) {
  const reasons = [];
  const riskFlags = [];
  const intent = classification?.intent || "out_of_scope";
  const confidence = Number(classification?.confidence ?? 0);
  const tone = classification?.tone || "neutral";

  if (!replyGenerationOk) {
    return needsReview("generation_error", reasons, riskFlags);
  }

  if (classification?.need_human || intent === "human_handoff") {
    return needsReview("human_handoff", reasons, riskFlags);
  }

  if (intent === "complaint") {
    return needsReview("complaint", reasons, ["complaint"]);
  }

  if (tone === "angry") {
    return needsReview("angry", reasons, ["angry_tone"]);
  }

  if (intent === "faq" && !matchedFaq && confidence < 0.7) {
    return needsReview("faq_miss", reasons, ["faq_miss"]);
  }

  if (confidence > 0 && confidence < 0.5) {
    return needsReview("low_confidence", reasons, ["low_confidence"]);
  }

  if (intent === "product_recommendation" && missingProductFields.length > 0) {
    reasons.push("商品推薦條件不足，先追問使用者。");
    return {
      decision: "auto_reply",
      reasons,
      riskFlags,
      handoffReason: null
    };
  }

  if (intent === "product_recommendation" && recommendedProducts.length > 0) {
    reasons.push("已找到符合條件的商品推薦。");
  } else if (intent === "faq" && matchedFaq) {
    reasons.push("已命中 FAQ 知識庫。");
  } else {
    reasons.push("未觸發轉人工條件，使用 AI 自動回覆。");
  }

  return {
    decision: "auto_reply",
    reasons,
    riskFlags,
    handoffReason: null
  };
}

function needsReview(reasonKey, reasons, extraRiskFlags = []) {
  reasons.push(HANDOFF_TEXT[reasonKey]);
  return {
    decision: "needs_review",
    reasons,
    riskFlags: [...extraRiskFlags],
    handoffReason: HANDOFF_TEXT[reasonKey]
  };
}
