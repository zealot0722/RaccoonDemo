import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductRecommendationReply,
  getMissingProductFields,
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

test("builds product recommendations with details and links inside the reply", () => {
  const reply = buildProductRecommendationReply([products[0]], {
    budget: 1000,
    use_case: "新手入門"
  });

  assert.match(reply, /P001｜入門保養組/);
  assert.match(reply, /詳情連結：\/products\/P001/);
  assert.doesNotMatch(reply, /圖片：\/assets\/p001.png/);
});
