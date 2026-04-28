import test from "node:test";
import assert from "node:assert/strict";

import {
  getMissingProductFields,
  recommendProducts
} from "../src/server/recommendation.js";

const products = [
  {
    code: "P001",
    name_zh: "入門保養組",
    category: "保養",
    price: 890,
    tags: ["新手", "送禮", "預算友善"],
    use_cases: ["日常使用", "新手入門"]
  },
  {
    code: "P002",
    name_zh: "行動辦公耳機",
    category: "3C",
    price: 1680,
    tags: ["通勤", "遠距會議"],
    use_cases: ["工作", "通勤"]
  },
  {
    code: "P003",
    name_zh: "高效清潔組",
    category: "生活用品",
    price: 520,
    tags: ["租屋", "清潔"],
    use_cases: ["居家清潔"]
  }
];

test("asks for more detail when product request lacks budget and use case", () => {
  const missing = getMissingProductFields({
    intent: "product_recommendation",
    budget: null,
    use_case: "",
    keywords: ["推薦"]
  });

  assert.deepEqual(missing, ["budget", "use_case"]);
});

test("recommends Chinese product cards under budget", () => {
  const result = recommendProducts(products, {
    budget: 1000,
    use_case: "新手入門",
    keywords: ["新手", "商品"]
  });

  assert.equal(result[0].code, "P001");
  assert.equal(result[0].name_zh, "入門保養組");
  assert.ok(result.every((product) => product.price <= 1000));
});
