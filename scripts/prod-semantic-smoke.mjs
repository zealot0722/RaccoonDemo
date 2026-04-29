const accessCode = process.env.DEMO_ACCESS_CODE;
const endpoint = process.env.PROD_CHAT_URL || "https://raccoondemo.vercel.app/api/chat";
const caseDelayMs = Number(process.env.CASE_DELAY_MS || 0);
const retryDelayMs = Number(process.env.RETRY_DELAY_MS || 65000);
const maxRetries = Number(process.env.MAX_RETRIES || 2);
const startAt = Number(process.env.START_AT || 1);
const maxCases = Number(process.env.MAX_CASES || 0);
const summaryOnly = process.env.SUMMARY_ONLY === "1";
const setupDelayMs = Number(process.env.SETUP_DELAY_MS || 3000);

if (!accessCode) {
  throw new Error("DEMO_ACCESS_CODE is required");
}

const rounds = [
  [
    faq("退貨期限大概怎麼算", "F001"),
    product("我想找 1000 元內的新手入門商品", "P001"),
    productMissing("幫我推薦商品"),
    productFollowUp("還有其他的嗎"),
    orderFound("RAC1004的東西在哪", "RAC1004"),
    orderMissing("我的包裹到哪了"),
    returnMissing("我要退貨"),
    returnReady("王小明 0912345678 RC123456789TW"),
    human("我要找真人客服"),
    complaint("你們服務太差了"),
    chitchat("哈囉"),
    unclear("123123123"),
    ended("沒有了"),
    multiIntent("我要退貨，順便查 RAC1001 到哪")
  ],
  [
    faq("付款能刷卡嗎", "F002"),
    product("兩千以內通勤用 3C 商品", "P002"),
    productMissing("我想看產品但沒想法"),
    productFollowUp("便宜一點的有嗎"),
    orderFound("幫我看 RAC1001 到哪了", "RAC1001"),
    orderMissing("物流進度能查嗎"),
    returnMissing("收到商品破損了"),
    returnReady("送貨貨號RC123456789TW 姓名林小美 電話0987654321"),
    human("可以轉人工嗎"),
    complaint("我真的很不爽"),
    chitchat("你好"),
    unclear("asdfasdf"),
    ended("不用了"),
    multiIntent("幫我推薦耳機，也查一下 RAC1004")
  ],
  [
    faq("配送通常幾天會到", "F003"),
    product("700 左右送禮用的東西", "P004"),
    productMissing("商品可以幫我挑一下嗎"),
    productFollowUp("那改成 2000 以下"),
    orderFound("RC987654321TW 送到了嗎", "RAC1002"),
    orderMissing("想知道貨態"),
    returnMissing("東西壞掉想換貨"),
    returnReady("我是陳大同，電話0911111111，貨號RC987654321TW"),
    human("請專人協助我"),
    complaint("這次處理很爛"),
    chitchat("在嗎"),
    unclear("zzzzzz"),
    ended("先這樣"),
    multiIntent("我要找真人，順便問保固")
  ],
  [
    faq("保固維修是一年嗎", "F004"),
    product("600 以下租屋清潔用品", "P003"),
    productMissing("有沒有適合入門的東西"),
    productFollowUp("第二個有現貨嗎"),
    orderFound("訂單 RAC1002 現在狀態", "RAC1002"),
    orderMissing("怎麼還沒到"),
    returnMissing("包裹少件要處理"),
    returnReady("貨號 RC555666777TW，姓名吳小安，電話 0922222222"),
    human("我想找人處理"),
    complaint("客服態度很糟"),
    chitchat("hello"),
    unclear("??????"),
    ended("沒問題"),
    multiIntent("商品壞掉想退，請人工客服接手")
  ],
  [
    faq("換貨流程可以先說明嗎", "F001"),
    product("辦公室用的杯子 1000 內", "P004"),
    productMissing("想買商品，還沒有預算和用途"),
    productFollowUp("我不要耳機，換生活用品"),
    orderFound("包裹 RC555666777TW 目前位置", "RAC1004"),
    orderMissing("可以看配送進度嗎"),
    returnMissing("商品不能用想退款"),
    returnReady("姓名張小華 電話0933333333 送貨貨號RC123456789TW"),
    human("幫我聯絡客服"),
    complaint("我要客訴"),
    chitchat("嗨"),
    unclear("0000000"),
    ended("謝謝"),
    multiIntent("付款方式和配送進度都想問")
  ]
];

const allCases = rounds.flatMap((cases, roundIndex) => {
  return cases.map((item, caseIndex) => ({
    round: roundIndex + 1,
    caseIndex: caseIndex + 1,
    item
  }));
});
const selectedCases = allCases
  .slice(Math.max(0, startAt - 1), maxCases > 0 ? Math.max(0, startAt - 1) + maxCases : undefined);
const results = [];
const startedAt = Date.now();

for (const { round, caseIndex, item } of selectedCases) {
  const sessionId = `prod-fuzzy-${startedAt}-${round}-${caseIndex}`;
  let attempt = 0;
  let result;

  while (attempt <= maxRetries) {
    attempt += 1;
    result = await runCase({ round, caseIndex, item, sessionId, attempt });
    if (!isRateLimitResult(result) || attempt > maxRetries) break;
    await sleep(retryDelayMs);
  }

  results.push(result);
  if (caseDelayMs > 0) await sleep(caseDelayMs);
}

const failures = results.filter((item) => !item.pass);
const byCategory = results.reduce((acc, item) => {
  const current = acc[item.category] || { total: 0, pass: 0, fail: 0 };
  current.total += 1;
  if (item.pass) current.pass += 1;
  else current.fail += 1;
  acc[item.category] = current;
  return acc;
}, {});

const payload = {
  endpoint,
  startAt,
  maxCases,
  attempted: selectedCases.length,
  total: results.length,
  pass: results.length - failures.length,
  fail: failures.length,
  byCategory,
  failures,
  results: summaryOnly ? undefined : results
};

console.log(JSON.stringify(payload, null, 2));

function faq(message, expectedFaqCode) {
  return { category: "FAQ", message, expected: "faq", expectedFaqCode };
}

function product(message, expectedProductCode) {
  return { category: "有效商品推薦", message, expected: "product_recommendation", expectedProductCode };
}

function productMissing(message) {
  return { category: "商品條件不足", message, expected: "product_recommendation", expectMissingProductFields: true };
}

function productFollowUp(message) {
  return {
    category: "商品追問",
    message,
    expected: "product_recommendation",
    setup: ["我想找 2000 元內送禮或通勤用商品"]
  };
}

function orderFound(message, expectedOrderNo) {
  return { category: "查貨態命中", message, expected: "order_status", expectedOrderNo };
}

function orderMissing(message) {
  return { category: "查貨態缺編號", message, expected: "order_status", expectMissingOrderFields: true };
}

function returnMissing(message) {
  return { category: "退貨缺資料", message, expected: "return_request", expectMissingReturnFields: true };
}

function returnReady(message) {
  return {
    category: "退貨資料齊全",
    message,
    expected: "return_request",
    expectedDecision: "needs_review",
    setup: ["我要退貨"]
  };
}

function human(message) {
  return { category: "轉人工", message, expected: "human_handoff", expectedDecision: "needs_review" };
}

function complaint(message) {
  return { category: "客訴", message, expected: "complaint", expectedDecision: "needs_review" };
}

function chitchat(message) {
  return { category: "閒聊", message, expected: "chitchat" };
}

function unclear(message) {
  return { category: "亂碼", message, expected: "unclear" };
}

function ended(message) {
  return { category: "對話結束", message, expected: "conversation_end", expectConversationEnded: true };
}

function multiIntent(message) {
  return { category: "複合意圖", message, expected: "multi_intent", expectedDecision: "needs_review" };
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { responseText: text };
  }
}

async function runCase({ round, caseIndex, item, sessionId, attempt }) {
  if (attempt === 1 && item.setup?.length) {
    for (const [setupIndex, setupMessage] of item.setup.entries()) {
      const setupResult = await runSetupMessage({
        message: setupMessage,
        sessionId,
        setupIndex: setupIndex + 1
      });
      if (!setupResult.ok) {
        return setupFailureResult({ round, caseIndex, item, setupResult, attempt });
      }
      if (setupDelayMs > 0) await sleep(setupDelayMs);
    }
  }

  const response = await postMessage({
    message: item.message,
    sessionId
  });

  const data = await readResponse(response);
  return toResult({
    round,
    caseIndex,
    item,
    response,
    data,
    attempt
  });
}

async function postMessage({ message, sessionId }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-access-code": accessCode
    },
    body: JSON.stringify({
      message,
      sessionId
    })
  });
  return response;
}

async function runSetupMessage({ message, sessionId, setupIndex }) {
  let attempt = 0;
  let last = null;
  while (attempt <= maxRetries) {
    attempt += 1;
    const response = await postMessage({ message, sessionId });
    const data = await readResponse(response);
    last = {
      ok: response.ok,
      status: response.status,
      attempt,
      setupIndex,
      message,
      replyHead: String(data.reply || data.message || data.responseText || "").slice(0, 120)
    };
    if (response.ok || !/rate limit|429/i.test(last.replyHead) || attempt > maxRetries) return last;
    await sleep(retryDelayMs);
  }
  return last;
}

function setupFailureResult({ round, caseIndex, item, setupResult, attempt }) {
  return {
    round,
    caseIndex,
    category: item.category,
    message: item.message,
    expected: item.expected,
    actual: `SETUP_HTTP_${setupResult.status}`,
    pass: false,
    status: setupResult.status,
    attempt,
    setupFailure: setupResult,
    decision: "",
    matchedFaq: "",
    products: [],
    missingProductFields: [],
    missingOrderFields: [],
    missingReturnFields: [],
    orderFound: "",
    orderNo: "",
    multiIntent: [],
    replyHead: `setup failed: ${setupResult.replyHead}`
  };
}

function isRateLimitResult(result) {
  return result.status === 500 && /rate limit|429/i.test(result.replyHead);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toResult({ round, caseIndex, item, response, data, attempt }) {
  const classification = data.classification || {};
  const decision = data.decision || {};
  const actual = classification.intent || `HTTP_${response.status}`;
  const pass = response.ok && matchesExpected(item, data);

  return {
    round,
    caseIndex,
    category: item.category,
    message: item.message,
    expected: item.expected,
    actual,
    pass,
    status: response.status,
    attempt,
    confidence: classification.confidence,
    decision: decision.decision || "",
    matchedFaq: data.matchedFaq?.code || "",
    products: (data.recommendedProducts || []).map((product) => product.code),
    missingProductFields: data.missingProductFields || [],
    missingOrderFields: data.missingOrderFields || [],
    missingReturnFields: data.missingReturnFields || [],
    orderFound: data.orderStatus?.found ?? "",
    orderNo: data.orderStatus?.order_no || "",
    multiIntent: classification.multi_intent || [],
    replyHead: String(data.reply || data.message || data.responseText || "").slice(0, 120)
  };
}

function matchesExpected(item, data) {
  const classification = data.classification || {};
  if (item.expected === "multi_intent") {
    return (classification.multi_intent?.length || 0) > 1 &&
      data.decision?.decision === item.expectedDecision;
  }

  if (classification.intent !== item.expected) return false;
  if (item.expectedFaqCode && data.matchedFaq?.code !== item.expectedFaqCode) return false;
  if (item.expectedProductCode && data.recommendedProducts?.[0]?.code !== item.expectedProductCode) return false;
  if (item.expectMissingProductFields && !data.missingProductFields?.length) return false;
  if (item.expectedOrderNo && data.orderStatus?.order_no !== item.expectedOrderNo) return false;
  if (item.expectMissingOrderFields && !data.missingOrderFields?.length) return false;
  if (item.expectMissingReturnFields && !data.missingReturnFields?.length) return false;
  if (item.expectedDecision && data.decision?.decision !== item.expectedDecision) return false;
  if (item.expectConversationEnded && !data.conversationEnded) return false;
  return true;
}
