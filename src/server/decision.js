const HANDOFF_TEXT = {
  human_handoff: "您已要求真人客服協助，系統會建立待處理工單。",
  complaint: "您提出的是客訴或負面服務體驗，需要真人客服接手。",
  angry: "偵測到訊息語氣較強烈，需要真人客服優先處理。",
  low_confidence: "AI 判斷信心不足，需要真人客服確認。",
  faq_miss: "FAQ 沒有命中足夠明確的答案，需要真人客服確認。",
  order_status_miss: "十分抱歉，目前沒有查到這筆貨態，需要客服人員協助確認。",
  generation_error: "AI 回覆產生失敗，需要真人客服接手。"
};

export function decideNextAction({
  classification,
  matchedFaq,
  recommendedProducts = [],
  replyGenerationOk = true,
  missingProductFields = [],
  orderStatus = null,
  missingOrderFields = []
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
    reasons.push("商品推薦條件不足，先追問必要條件。");
    return {
      decision: "auto_reply",
      reasons,
      riskFlags,
      handoffReason: null
    };
  }

  if (intent === "order_status" && missingOrderFields.length > 0) {
    reasons.push("查貨態資料不足，先追問訂單編號或物流單號。");
    return {
      decision: "auto_reply",
      reasons,
      riskFlags,
      handoffReason: null
    };
  }

  if (intent === "order_status" && orderStatus?.found) {
    reasons.push("已查到虛擬貨態資料。");
  } else if (intent === "order_status" && orderStatus && !orderStatus.found) {
    return needsReview("order_status_miss", reasons, ["order_status_miss"]);
  }

  if (intent === "product_recommendation" && recommendedProducts.length > 0) {
    reasons.push("已找到符合條件的商品，將商品資訊放入聊天訊息。");
  } else if (intent === "product_recommendation") {
    reasons.push("未找到符合條件的商品，不產生未查證商品。");
  } else if (intent === "order_status") {
    // Order-status reasons are handled above because found and missing records diverge.
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
