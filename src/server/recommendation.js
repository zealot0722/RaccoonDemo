const FIELD_LABELS = {
  budget: "預算",
  use_case: "用途或使用情境"
};

export function getMissingProductFields(classification) {
  if (classification?.intent !== "product_recommendation") return [];

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
  return fields.map((field) => FIELD_LABELS[field] || field).join("、");
}

export function recommendProducts(products, classification) {
  const budget = normalizeBudget(classification?.budget);
  const category = normalizeText(classification?.category);
  const useCase = normalizeText(classification?.use_case);
  const keywords = Array.isArray(classification?.keywords)
    ? classification.keywords.map(normalizeText)
    : [];

  const scored = products
    .map((product) => ({
      product,
      score: scoreProduct(product, { budget, category, useCase, keywords })
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price);

  const underBudget = scored.filter(({ product }) => {
    return !budget || Number(product.price) <= budget;
  });

  const source = underBudget.length ? underBudget : scored;
  return source.slice(0, 3).map(({ product }) => product);
}

export function normalizeBudget(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[,，]/g, "");
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function scoreProduct(product, { budget, category, useCase, keywords }) {
  let score = 1;
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isMeaningfulUseCaseToken(value) {
  const token = normalizeText(value);
  return Boolean(token && !["推薦", "商品", "產品", "找", "想要"].includes(token));
}
