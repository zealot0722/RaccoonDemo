const FIELD_LABELS = {
  budget: "預算",
  use_case: "用途或使用情境"
};

export function getMissingProductFields(classification) {
  if (classification?.intent !== "product_recommendation") return [];
  if (classification?.follow_up) return [];

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
  const referenceProductCode = normalizeText(classification?.reference_product_code);
  const excludedCodes = new Set(
    (classification?.exclude_product_codes || []).map((code) => normalizeText(code))
  );
  const excludedCategories = new Set(
    (classification?.exclude_categories || []).map((category) => normalizeText(category))
  );
  const excludedKeywords = new Set(
    (classification?.exclude_keywords || []).flatMap(expandKeyword).map(normalizeText)
  );
  const referencePrice = normalizeBudget(classification?.reference_price);
  const wantsCheaper = classification?.follow_up === "cheaper";
  const keywords = Array.isArray(classification?.keywords)
    ? [...new Set(classification.keywords.flatMap(expandKeyword))]
    : [];
  const hasSpecificNeed = Boolean(category || useCase || keywords.length);
  const budgetOnlyScore = budget ? 4 : 0;
  const preferBudgetCeiling = budget && classification?.follow_up === "budget_refinement";

  if (referenceProductCode) {
    const referenced = products.find((product) => normalizeText(product.code) === referenceProductCode);
    if (referenced) return [referenced];
  }

  const scored = products
    .filter((product) => !isExcludedProduct(product, {
      excludedCodes,
      excludedCategories,
      excludedKeywords
    }))
    .map((product) => ({
      product,
      score: scoreProduct(product, { budget, category, useCase, keywords })
    }))
    .filter(({ score }) => score > 0 && (!hasSpecificNeed || score > budgetOnlyScore))
    .sort((a, b) => compareScoredProducts(a, b, { budget, preferBudgetCeiling }));

  const underBudget = scored.filter(({ product }) => !budget || Number(product.price) <= budget);
  const cheaperThanReference = scored.filter(({ product }) => {
    return !referencePrice || Number(product.price) < referencePrice;
  });

  let source = wantsCheaper && cheaperThanReference.length
    ? cheaperThanReference
    : underBudget.length ? underBudget : scored;

  const filtered = source.filter(({ product }) => !isExcludedProduct(product, {
    excludedCodes,
    excludedCategories,
    excludedKeywords
  }));
  if (filtered.length) source = filtered;
  else if (classification?.follow_up && (excludedCodes.size || excludedCategories.size || excludedKeywords.size)) {
    const fallback = fallbackProductScores(products, { budget, referencePrice, wantsCheaper })
      .filter(({ product }) => !isExcludedProduct(product, {
        excludedCodes,
        excludedCategories,
        excludedKeywords
      }));
    if (fallback.length) source = fallback;
  }

  return source.slice(0, 3).map(({ product }) => product);
}

export function enrichProductClassification(classification, message, conversationHistory = []) {
  if (classification?.intent === "unclear") return classification;
  if (classification?.intent === "order_status") return classification;
  if (isBareOrderIdentifierText(message)) {
    return {
      ...classification,
      intent: "out_of_scope",
      confidence: Math.max(Number(classification?.confidence || 0), 0.7),
      need_human: false,
      budget: null,
      category: "",
      use_case: "",
      follow_up: "",
      missing_fields: [],
      keywords: [...new Set([...(classification?.keywords || []), "order_identifier_without_context"])]
    };
  }

  const context = getProductConversationContext(conversationHistory);
  const productReference = resolveProductReference(message, context);
  const followUp = inferProductFollowUp(message, context);
  const messageBudget = extractBudget(message);
  const messageUseCase = inferUseCaseFromText(message);
  const negativePreferences = extractNegativePreferences(message, context);
  const effectiveProductReference = productReference &&
    !negativePreferences.productCodes.includes(productReference.code)
    ? productReference
    : null;
  const freshProductRequest = isFreshProductRequest(message);
  const hasNegativePreference = negativePreferences.productCodes.length ||
    negativePreferences.categories.length ||
    negativePreferences.keywords.length;
  const hasProductContinuation = context.hasProductContext &&
    (effectiveProductReference || followUp || messageBudget || messageUseCase || hasNegativePreference ||
      classification?.intent === "product_recommendation");

  if (isProtectedIntent(classification?.intent) && !hasProductContinuation && !freshProductRequest) {
    return classification;
  }

  if (!freshProductRequest && !hasProductContinuation) return classification;

  const contextFollowUp = context.hasProductContext
    ? effectiveProductReference ? "product_reference" : followUp || (messageBudget ? "budget_refinement" : "context_continuation")
    : classification?.follow_up || "";

  const next = {
    ...classification,
    intent: "product_recommendation",
    confidence: Math.max(Number(classification?.confidence || 0), effectiveProductReference || followUp || freshProductRequest ? 0.82 : 0.76),
    need_human: false,
    follow_up: contextFollowUp,
    budget: effectiveProductReference ? context.lastBudget || null : messageBudget || classification?.budget || context.lastBudget || null,
    category: messageUseCase ? classification?.category || "" : classification?.category || "",
    use_case: messageUseCase || classification?.use_case || context.lastUseCase || "",
    keywords: buildContextualKeywords(classification?.keywords, message),
    missing_fields: []
  };

  if (effectiveProductReference) {
    next.reference_product_code = effectiveProductReference.code;
  }

  if (context.recommendedProductCodes.length && ["alternative", "cheaper"].includes(next.follow_up)) {
    next.exclude_product_codes = context.recommendedProductCodes;
  }

  if (negativePreferences.productCodes.length) {
    next.exclude_product_codes = [
      ...new Set([...(next.exclude_product_codes || []), ...negativePreferences.productCodes])
    ];
  }
  if (negativePreferences.categories.length) {
    next.exclude_categories = negativePreferences.categories;
  }
  if (negativePreferences.keywords.length) {
    next.exclude_keywords = negativePreferences.keywords;
  }

  if (context.lastRecommendedPrice) {
    next.reference_price = context.lastRecommendedPrice;
    if (next.follow_up === "cheaper" && !next.budget) {
      next.budget = context.lastRecommendedPrice - 1;
    }
  }

  return next;
}

export function buildProductRecommendationReply(products, classification = {}) {
  if (!products?.length) {
    return "目前沒有找到完全符合您條件的商品。\n請您調整預算、用途或品類後再試一次。";
  }

  const intro = "依照您的需求，我先幫您整理幾個比較適合的選項。";
  const details = products.map((product) => {
    return [
      `${product.code}｜${product.name_zh}`,
      product.name_original ? `原文名稱：${product.name_original}` : "",
      `價格：NT$ ${formatPrice(product.price)}`,
      `庫存：${product.stock_status || "請洽客服確認"}`,
      product.use_cases?.length ? `適合情境：${product.use_cases.slice(0, 3).join("、")}` : "",
      `詳情連結：${product.product_url || `/products/${product.code}`}`
    ].filter(Boolean).join("\n");
  });

  return [intro, ...details].join("\n\n");
}

export function normalizeBudget(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsedRange = parseBudgetCeiling(value);
  if (parsedRange) return parsedRange;

  const normalized = sanitizeBudgetText(value);
  const numericMatch = normalized.match(/(\d+)\s*(k|K|千)?/);
  if (numericMatch) {
    const number = Number(numericMatch[1]);
    return /k|K|千/.test(numericMatch[2] || "") && number < 100 ? number * 1000 : number;
  }

  const chineseMatch = normalized.match(/[一二兩三四五六七八九十百千萬]+/);
  if (!chineseMatch) return null;
  const hasBudgetContext = /預算|價格|大概|差不多|左右|以內|以下|元|塊/.test(normalized);
  const hasLargeUnit = /百|千|萬/.test(chineseMatch[0]);
  return hasBudgetContext || hasLargeUnit ? parseChineseNumber(chineseMatch[0]) : null;
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
  if (useCase) {
    if (haystack.includes(useCase)) {
      score += 4;
    } else {
      const useCaseMatches = expandKeyword(useCase)
        .filter((token) => token.length >= 2 && haystack.includes(token));
      if (useCaseMatches.length) score += Math.min(4, useCaseMatches.length * 2);
    }
  }

  for (const keyword of keywords) {
    if (keyword && haystack.includes(keyword)) score += 2;
  }

  return score;
}

function compareScoredProducts(a, b, { budget, preferBudgetCeiling }) {
  const scoreDiff = b.score - a.score;
  if (scoreDiff) return scoreDiff;

  if (preferBudgetCeiling) {
    const aDistance = Math.abs(Number(a.product.price) - budget);
    const bDistance = Math.abs(Number(b.product.price) - budget);
    if (aDistance !== bDistance) return aDistance - bDistance;
  }

  return Number(a.product.price) - Number(b.product.price);
}

function fallbackProductScores(products, { budget, referencePrice, wantsCheaper }) {
  return products
    .map((product) => {
      let score = 1;
      if (budget && Number(product.price) <= budget) score += 4;
      if (wantsCheaper && referencePrice && Number(product.price) < referencePrice) score += 3;
      if (product.tags?.some((tag) => /預算友善|日常|新手/.test(tag))) score += 1;
      return { product, score };
    })
    .filter(({ product }) => {
      if (budget && Number(product.price) > budget) return false;
      if (wantsCheaper && referencePrice && Number(product.price) >= referencePrice) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || Number(a.product.price) - Number(b.product.price));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getProductConversationContext(conversationHistory = []) {
  const recent = conversationHistory.slice(-8);
  const aiText = recent
    .filter((item) => item.role !== "customer")
    .map((item) => String(item.content || ""))
    .join("\n");
  const customerText = recent
    .filter((item) => item.role === "customer")
    .map((item) => String(item.content || ""))
    .join("\n");
  const combined = `${aiText}\n${customerText}`;

  return {
    hasProductContext: /推薦|商品|產品|預算|用途|使用情境|詳情連結|P\d{3}/i.test(combined),
    recommendedProductCodes: extractProductCodes(aiText),
    lastBudget: extractLastBudget(customerText),
    lastUseCase: inferUseCaseFromText(customerText) || inferUseCaseFromText(aiText),
    lastRecommendedPrice: extractLastPrice(aiText)
  };
}

function inferProductFollowUp(message, context) {
  const text = String(message || "");
  if (!context.hasProductContext) return "";
  if (/更便宜|便宜一點|低一點|價格低|預算低/.test(text)) return "cheaper";
  if (/不要|不想要|別|排除|換/.test(text)) return "alternative";
  if (/其他|別的|還有嗎|還有其他|換一個|換款|不同|另一個|另.*選項/.test(text)) return "alternative";
  if (extractBudget(text)) return "budget_refinement";
  if (inferUseCaseFromText(text)) return "need_refinement";
  return "";
}

function extractProductCodes(text) {
  return [...new Set(String(text || "").match(/\bP\d{3,}\b/gi) || [])].map((code) => code.toUpperCase());
}

function extractBudget(text) {
  const parsedRange = parseBudgetCeiling(text);
  if (parsedRange) return parsedRange;

  const normalized = sanitizeBudgetText(text);
  const numericMatch = normalized.match(/(\d+)\s*(k|K|千|元|塊|以內|以下|左右)?/);
  if (numericMatch) {
    const number = Number(numericMatch[1]);
    const unit = numericMatch[2] || "";
    return /k|K|千/.test(unit) && number < 100 ? number * 1000 : number;
  }

  const chineseMatch = normalized.match(/([一二兩三四五六七八九十百千萬]+)\s*(元|塊|以內|以下|左右)?/);
  if (!chineseMatch) return null;
  const hasBudgetContext = /預算|價格|大概|差不多|左右|以內|以下|元|塊/.test(normalized);
  const hasLargeUnit = /百|千|萬/.test(chineseMatch[1]);
  return hasBudgetContext || hasLargeUnit ? parseChineseNumber(chineseMatch[1]) : null;
}

function extractLastBudget(text) {
  const segments = String(text || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
  for (const segment of segments.reverse()) {
    const parsed = extractBudget(segment);
    if (parsed) return parsed;
  }
  return null;
}

function extractLastPrice(text) {
  const matches = [...String(text || "").replace(/[,，]/g, "").matchAll(/(?:NT\$|價格：?NT\$?)\s*(\d+)/gi)];
  if (matches.length) return Number(matches.at(-1)[1]);

  const fallback = [...String(text || "").replace(/[,，]/g, "").matchAll(/價格[:：]?\s*(\d+)/g)];
  return fallback.length ? Number(fallback.at(-1)[1]) : null;
}

function inferUseCaseFromText(text) {
  if (/新手|入門/.test(text)) return "新手入門";
  if (/送禮|禮物/.test(text)) return "送禮";
  if (/自用/.test(text)) return "自用";
  if (/家用|居家/.test(text)) return "居家使用";
  if (/清潔/.test(text)) return "清潔";
  if (/保養/.test(text)) return "保養";
  if (/通勤|辦公|會議/.test(text)) return "工作通勤";
  if (/杯|馬克杯|日常/.test(text)) return "日常使用";
  if (/耳機|3c/i.test(text)) return "3C";
  return "";
}

function buildContextualKeywords(keywords = [], message = "") {
  const direct = ["新手", "入門", "送禮", "禮物", "自用", "家用", "居家", "保養", "清潔", "耳機", "杯", "馬克杯", "日常", "通勤", "辦公", "會議", "3C"]
    .filter((keyword) => new RegExp(keyword, "i").test(message));
  const productCodes = String(message || "").match(/\bP\d{3,}\b/gi) || [];
  return [...new Set([...(Array.isArray(keywords) ? keywords : []), ...direct, ...productCodes.map((code) => code.toUpperCase())])];
}

function isProtectedIntent(intent) {
  return ["human_handoff", "complaint", "return_request", "order_status", "unclear"].includes(intent);
}

function isFreshProductRequest(message = "") {
  const text = String(message || "");
  if (/退貨|退款|換貨|付款|配送|運送|物流|貨態|保固|發票|真人|人工|專人|客訴|投訴/.test(text)) {
    return false;
  }

  return /推薦商品|商品推薦|推薦.*商品|想找.*商品|找.*(新手|入門|送禮|禮物|耳機|保養|清潔|杯|3c)|想買.*(新手|入門|送禮|禮物|耳機|保養|清潔|杯|3c)|預算.*(商品|新手|入門|送禮|禮物|耳機|保養|清潔|杯|3c)|\d+\s*(元|塊|以內|以下)?.*(商品|新手|入門|送禮|禮物|耳機|保養|清潔|杯|3c)|新手商品|送禮.*商品|家用.*商品/i.test(text);
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
  if (/日常/.test(value)) expanded.push("日常");

  return expanded.map(normalizeText).filter(Boolean);
}

function resolveProductReference(message = "", context = {}) {
  const codes = context.recommendedProductCodes || [];
  if (!context.hasProductContext || !codes.length) return null;

  const text = String(message || "");
  const ordinal = text.match(/第\s*(\d+|[一二兩三四五六七八九十])\s*(個|款|項|組|種)?/);
  if (ordinal) {
    const index = parseOrdinal(ordinal[1]) - 1;
    return codes[index] ? { code: codes[index] } : null;
  }

  if (/剛剛那個|剛才那個|上面那個|這個|那個|這款|那款|此款|它|上一個|前一個/.test(text)) {
    return { code: codes[0] };
  }

  return null;
}

function parseOrdinal(value) {
  if (/^\d+$/.test(String(value))) return Number(value);
  return parseChineseNumber(value) || 0;
}

function extractNegativePreferences(message = "", context = {}) {
  const text = String(message || "");
  const productCodes = new Set();
  const categories = new Set();
  const keywords = new Set();

  for (const match of text.matchAll(/\bP\d{3,}\b/gi)) {
    if (hasNegativeCueNear(text, match.index || 0)) productCodes.add(match[0].toUpperCase());
  }

  if (/不要這(個|款|項)?|不想要這(個|款|項)?|不要它|不要他|排除這(個|款|項)?/.test(text)) {
    const code = context.recommendedProductCodes?.[0];
    if (code) productCodes.add(code);
  }

  const negativeTerms = [
    ["耳機", "3C"],
    ["3C", "3C"],
    ["保養", "保養"],
    ["清潔", "清潔"],
    ["杯", "杯"],
    ["馬克杯", "杯"]
  ];

  for (const [term, normalized] of negativeTerms) {
    if (new RegExp(`(不要|不想要|別|排除)[^，。,.!?！？]{0,8}${term}`, "i").test(text)) {
      keywords.add(normalized);
      if (["3C", "保養"].includes(normalized)) categories.add(normalized);
      if (normalized === "清潔") keywords.add("清潔");
    }
  }

  return {
    productCodes: [...productCodes],
    categories: [...categories],
    keywords: [...keywords]
  };
}

function hasNegativeCueNear(text, index) {
  const prefix = text.slice(Math.max(0, index - 12), index);
  return /不要|不想要|別|排除/.test(prefix);
}

function isExcludedProduct(product, { excludedCodes, excludedCategories, excludedKeywords }) {
  if (excludedCodes.has(normalizeText(product.code))) return true;
  if (excludedCategories.has(normalizeText(product.category))) return true;

  const haystack = [
    product.code,
    product.name_zh,
    product.name_original,
    product.category,
    product.description_zh,
    ...(product.tags || []),
    ...(product.use_cases || [])
  ].map(normalizeText).join(" ");

  for (const keyword of excludedKeywords) {
    if (keyword && haystack.includes(keyword)) return true;
  }

  return false;
}

function parseBudgetCeiling(value) {
  const normalized = sanitizeBudgetText(value);
  const numericRange = normalized.match(/(\d+)\s*(k|K|千)?\s*(?:到|至|-|~|～)\s*(\d+)\s*(k|K|千)?/);
  if (numericRange) {
    return parseBudgetAmount(numericRange[3], numericRange[4] || numericRange[2]);
  }

  const chineseRange = normalized.match(/([一二兩三四五六七八九十百千萬]+)\s*(?:到|至|-|~|～)\s*([一二兩三四五六七八九十百千萬]+)/);
  if (chineseRange) {
    return parseBudgetAmount(chineseRange[2]);
  }

  const numericUpper = normalized.match(/(\d+)\s*(k|K|千)?\s*(?:以上|起)\s*(\d+)\s*(k|K|千)?\s*(?:以下|以內)/);
  if (numericUpper) {
    return parseBudgetAmount(numericUpper[3], numericUpper[4] || numericUpper[2]);
  }

  const chineseUpper = normalized.match(/([一二兩三四五六七八九十百千萬]+)\s*(?:以上|起)\s*([一二兩三四五六七八九十百千萬]+)\s*(?:以下|以內)/);
  if (chineseUpper) {
    return parseBudgetAmount(chineseUpper[2]);
  }

  return null;
}

function sanitizeBudgetText(value) {
  return String(value || "")
    .replace(/\bP\d{3,}\b/gi, "")
    .replace(/\b(?:RAC|ORD|ORDER|O)[-_]?\d{4,12}\b/gi, "")
    .replace(/\b(?:RC|TRK|TRACK|SHIP)[-_]?[A-Z0-9]{6,16}\b/gi, "")
    .replace(/\b\d+\s*[cC]\b/g, "")
    .replace(/第\s*\d+\s*(個|款|項|組|種)?/g, "")
    .replace(/第\s*[一二兩三四五六七八九十]+\s*(個|款|項|組|種)?/g, "")
    .replace(/[,，]/g, "");
}

function parseBudgetAmount(value, unit = "") {
  if (/^\d+$/.test(String(value))) {
    const number = Number(value);
    return /k|K|千/.test(unit) && number < 100 ? number * 1000 : number;
  }

  return parseChineseNumber(value);
}

function isBareOrderIdentifierText(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;
  const stripped = text
    .replace(/\b(?:RAC|ORD|ORDER|O)[-_]?\d{4,12}\b/gi, "")
    .replace(/\b(?:RC|TRK|TRACK|SHIP)[-_]?[A-Z0-9]{6,16}\b/gi, "")
    .replace(/[\s，,。.!！?？：:]+/g, "");
  return stripped.length === 0 && /\b(?:RAC|ORD|ORDER|O)[-_]?\d{4,12}\b|\b(?:RC|TRK|TRACK|SHIP)[-_]?[A-Z0-9]{6,16}\b/i.test(text);
}

function parseChineseNumber(input) {
  const text = String(input || "");
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  const colloquialThousands = text.match(/^([一二兩三四五六七八九])千([一二兩三四五六七八九])$/);
  if (colloquialThousands) {
    return digits[colloquialThousands[1]] * 1000 + digits[colloquialThousands[2]] * 100;
  }

  const colloquialHundreds = text.match(/^([一二兩三四五六七八九])百([一二兩三四五六七八九])$/);
  if (colloquialHundreds) {
    return digits[colloquialHundreds[1]] * 100 + digits[colloquialHundreds[2]] * 10;
  }

  const units = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;

  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(digits, char)) {
      number = digits[char];
      continue;
    }

    const unit = units[char];
    if (!unit) return null;
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }

  const value = total + section + number;
  return value || null;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("zh-TW");
}
