const FIELD_LABELS = {
  budget: "預算",
  use_case: "用途或使用情境"
};

export function getMissingProductFields(classification) {
  if (classification?.intent !== "product_recommendation") return [];

  const explicitMissing = Array.isArray(classification.missing_fields)
    ? classification.missing_fields.filter((field) => FIELD_LABELS[field])
    : [];
  if (explicitMissing.length) return [...new Set(explicitMissing)];

  const missing = [];
  const budget = normalizeBudget(classification?.budget);
  const useCase = String(classification?.use_case || "").trim();
  const keywords = Array.isArray(classification?.keywords)
    ? classification.keywords.filter(isMeaningfulUseCaseToken).join(" ")
    : "";
  const combined = `${useCase} ${keywords}`.trim();

  if (!budget) missing.push("budget");
  if (!combined) missing.push("use_case");

  return missing;
}

export function formatMissingProductFields(fields) {
  const labels = fields.map((field) => FIELD_LABELS[field] || field);
  if (labels.length <= 1) return labels[0] || "需求";
  return `${labels.slice(0, -1).join("、")}和${labels.at(-1)}`;
}

export function recommendProducts(products, classification) {
  const budget = normalizeBudget(classification?.budget);
  const category = normalizeText(classification?.category);
  const useCase = normalizeText(classification?.use_case);
  const keywords = Array.isArray(classification?.keywords)
    ? [...new Set(classification.keywords.flatMap(expandKeyword))]
    : [];
  const hasSpecificNeed = Boolean(category || useCase || keywords.length);
  const budgetOnlyScore = budget ? 4 : 0;

  const scored = products
    .map((product) => ({
      product,
      score: scoreProduct(product, { budget, category, useCase, keywords })
    }))
    .filter(({ score }) => score > 0 && (!hasSpecificNeed || score > budgetOnlyScore))
    .sort((a, b) => b.score - a.score || Number(a.product.price) - Number(b.product.price));

  const underBudget = scored.filter(({ product }) => {
    return !budget || Number(product.price) <= budget;
  });

  const source = underBudget.length ? underBudget : scored;
  return source.slice(0, 3).map(({ product }) => product);
}

export function buildProductRecommendationReply(products, classification = {}) {
  if (!products?.length) {
    return "目前沒有找到完全符合您條件的商品。\n請您調整預算、用途或品類後再試一次。";
  }

  const intro = "依照您的需求，我先幫您整理幾個比較適合的選項。";
  const details = products.map((product) => {
    const reason = buildRecommendationReason(product, classification);
    return [
      `${product.code}｜${product.name_zh}`,
      product.name_original ? `原文名稱：${product.name_original}` : "",
      `價格：NT$ ${formatPrice(product.price)}`,
      `庫存：${product.stock_status || "請洽客服確認"}`,
      product.use_cases?.length ? `適合情境：${product.use_cases.slice(0, 3).join("、")}` : "",
      `推薦理由：${reason}`,
      `詳情連結：${product.product_url || `/products/${product.code}`}`,
      product.image_url ? `圖片：${product.image_url}` : ""
    ].filter(Boolean).join("\n");
  });

  return [intro, ...details].join("\n\n");
}

export function normalizeBudget(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[,，]/g, "");
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function scoreProduct(product, { budget, category, useCase, keywords }) {
  let score = 0;
  const haystack = [
    product.code,
    product.name_zh,
    product.name_original,
    product.category,
    product.description_zh,
    ...(product.tags || []),
    ...(product.use_cases || [])
  ]
    .map(normalizeText)
    .join(" ");

  if (budget && Number(product.price) <= budget) score += 4;
  if (category && normalizeText(product.category).includes(category)) score += 3;
  if (useCase && haystack.includes(useCase)) score += 4;

  for (const keyword of keywords) {
    if (keyword && haystack.includes(keyword)) score += 2;
  }

  return score;
}

function buildRecommendationReason(product, classification) {
  const budget = normalizeBudget(classification?.budget);
  const reasons = [];

  if (budget && Number(product.price) <= budget) {
    reasons.push(`價格在 NT$ ${formatPrice(budget)} 以內`);
  }
  if (classification?.use_case) {
    reasons.push(`符合「${classification.use_case}」的使用情境`);
  }
  if (product.tags?.length) {
    reasons.push(`具備 ${product.tags.slice(0, 2).join("、")} 特性`);
  }

  return reasons.length ? reasons.join("，") : "和您目前描述的需求相符";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isMeaningfulUseCaseToken(value) {
  const token = normalizeText(value);
  return Boolean(token && !["商品", "推薦", "預算", "價格", "便宜"].includes(token));
}

function expandKeyword(value) {
  const token = normalizeText(value)
    .replace(/商品/g, "")
    .replace(/推薦/g, "")
    .replace(/預算/g, "")
    .replace(/價格/g, "")
    .trim();
  const expanded = [];

  if (token && !/^\d+\s*(元|塊)?$/.test(token)) expanded.push(token);
  if (/新手|入門/.test(value)) expanded.push("新手", "新手入門");
  if (/送禮|禮物/.test(value)) expanded.push("送禮");
  if (/清潔/.test(value)) expanded.push("清潔");
  if (/保養/.test(value)) expanded.push("保養");
  if (/耳機|3c/i.test(value)) expanded.push("耳機", "3c");
  if (/辦公|通勤|會議/.test(value)) expanded.push("辦公", "通勤", "會議");
  if (/杯|馬克杯/.test(value)) expanded.push("杯", "馬克杯");

  return expanded.map(normalizeText).filter(Boolean);
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("zh-TW");
}
