import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductRecommendationReply,
  enrichProductClassification,
  getMissingProductFields,
  normalizeBudget,
  recommendProducts
} from "../src/server/recommendation.js";

const products = [
  {
    code: "P001",
    name_zh: "入門保養組",
    name_original: "Raccoon Starter Care Kit",
    category: "保養",
    price: 890,
    product_url: "/products/P001",
    image_url: "/assets/p001.png",
    description_zh: "適合新手的基礎保養組合。",
    tags: ["新手", "送禮", "預算友善"],
    use_cases: ["日常使用", "新手入門"],
    stock_status: "現貨"
  },
  {
    code: "P002",
    name_zh: "專注降噪耳機",
    name_original: "Raccoon Focus Buds",
    category: "3C",
    price: 1680,
    product_url: "/products/P002",
    image_url: "/assets/p002.png",
    description_zh: "適合通勤與辦公。",
    tags: ["專注", "降噪"],
    use_cases: ["通勤", "辦公"]
  },
  {
    code: "P003",
    name_zh: "居家清潔組",
    name_original: "Raccoon Home Clean Set",
    category: "家用生活",
    price: 520,
    product_url: "/products/P003",
    image_url: "/assets/p003.png",
    description_zh: "小空間清潔組合。",
    tags: ["居家", "清潔"],
    use_cases: ["居家清潔"]
  },
  {
    code: "P004",
    name_zh: "質感禮品杯",
    name_original: "Raccoon Daily Mug",
    category: "生活用品",
    price: 680,
    product_url: "/products/P004",
    image_url: "/assets/p004.png",
    description_zh: "適合辦公室與日常使用的質感馬克杯。",
    tags: ["送禮", "辦公室", "日常", "預算友善"],
    use_cases: ["送禮", "辦公室", "日常使用"]
  }
];

test("asks for more detail when product request lacks budget and use case", () => {
  const missing = getMissingProductFields({
    intent: "product_recommendation",
    budget: null,
    use_case: "",
    keywords: ["商品"]
  });

  assert.deepEqual(missing, ["budget", "use_case"]);
});

test("parses conversational Chinese budget amounts", () => {
  assert.equal(normalizeBudget("預算一千"), 1000);
  assert.equal(normalizeBudget("兩千五以下"), 2500);
  assert.equal(normalizeBudget("大概三百五"), 350);
  assert.equal(normalizeBudget("2k"), 2000);
});

test("recommends Chinese products under budget", () => {
  const result = recommendProducts(products, {
    budget: 1000,
    use_case: "新手入門",
    keywords: ["新手", "推薦"]
  });

  assert.equal(result[0].code, "P001");
  assert.equal(result[0].name_zh, "入門保養組");
  assert.ok(result.every((product) => product.price <= 1000));
});

test("expands coarse LLM keywords before matching products", () => {
  const result = recommendProducts(products, {
    budget: 1000,
    use_case: "",
    keywords: ["新手商品", "1000 元"]
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].code, "P001");
});

test("recommends different products when customer asks for alternatives", () => {
  const result = recommendProducts(products, {
    budget: 1000,
    use_case: "",
    keywords: [],
    follow_up: "alternative",
    exclude_product_codes: ["P001"]
  });

  assert.ok(result.length >= 1);
  assert.notEqual(result[0].code, "P001");
  assert.deepEqual(result.map((product) => product.code), ["P003", "P004"]);
});

test("broadens alternative recommendations when the only strict match was already shown", () => {
  const result = recommendProducts(products, {
    budget: 1000,
    use_case: "新手入門",
    keywords: ["新手"],
    follow_up: "alternative",
    exclude_product_codes: ["P001"]
  });

  assert.ok(result.length >= 1);
  assert.notEqual(result[0].code, "P001");
});

test("uses later budget refinements to prefer better-priced products", () => {
  const result = recommendProducts(products, {
    budget: 600,
    use_case: "",
    keywords: [],
    follow_up: "budget_refinement",
    exclude_product_codes: ["P001"]
  });

  assert.equal(result[0].code, "P003");
  assert.ok(result.every((product) => product.price <= 600));
});

test("budget refinement prefers products near the new budget ceiling", () => {
  const result = recommendProducts(products, {
    budget: 2000,
    use_case: "",
    keywords: [],
    follow_up: "budget_refinement"
  });

  assert.equal(result[0].code, "P002");
  assert.ok(result.every((product) => product.price <= 2000));
});

test("budget refinement keeps the previously recommended product eligible", () => {
  const classification = enrichProductClassification({
    intent: "product_recommendation",
    confidence: 0.72,
    budget: null,
    use_case: "",
    keywords: []
  }, "那我最後確定要 2000 以下的", [
    { role: "customer", content: "我不要 1000 以下了，改 2000" },
    { role: "ai", content: "P002｜專注降噪耳機\n價格：NT$ 1680\n詳情連結：/products/P002" }
  ]);

  assert.equal(classification.follow_up, "budget_refinement");
  assert.equal(classification.budget, 2000);
  assert.deepEqual(classification.exclude_product_codes || [], []);
});

test("alternative follow-up still excludes products already shown", () => {
  const classification = enrichProductClassification({
    intent: "product_recommendation",
    confidence: 0.72,
    budget: null,
    use_case: "",
    keywords: []
  }, "有其他的嗎？", [
    { role: "customer", content: "我想找 1000 元內的新手商品" },
    { role: "ai", content: "P001｜入門保養組\n價格：NT$ 890\n詳情連結：/products/P001" }
  ]);

  assert.equal(classification.follow_up, "alternative");
  assert.deepEqual(classification.exclude_product_codes, ["P001"]);
});

test("builds product recommendations with details and links inside the reply", () => {
  const reply = buildProductRecommendationReply([products[0]], {
    budget: 1000,
    use_case: "新手入門"
  });

  assert.match(reply, /P001｜入門保養組/);
  assert.match(reply, /詳情連結：\/products\/P001/);
  assert.doesNotMatch(reply, /推薦理由/);
  assert.doesNotMatch(reply, /圖片：\/assets\/p001.png/);
});
