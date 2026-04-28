const PRODUCTS = [
  {
    code: "P001",
    name_zh: "入門保養組",
    name_original: "Raccoon Starter Care Kit",
    category: "保養",
    price: 890,
    image_url: "/assets/p001.png",
    product_url: "/products/P001",
    description_zh: "適合第一次嘗試保養的新手組合，包含基礎清潔、保濕與日常修護。",
    tags: ["新手", "送禮", "預算友善", "日常"],
    use_cases: ["新手入門", "日常使用", "送禮"],
    stock_status: "有庫存"
  },
  {
    code: "P002",
    name_zh: "行動辦公耳機",
    name_original: "Raccoon Focus Buds",
    category: "3C",
    price: 1680,
    image_url: "/assets/p002.png",
    product_url: "/products/P002",
    description_zh: "適合通勤與遠距會議的輕量耳機，主打清楚收音與長時間配戴舒適。",
    tags: ["通勤", "遠距會議", "工作", "3C"],
    use_cases: ["工作", "通勤", "線上會議"],
    stock_status: "有庫存"
  },
  {
    code: "P003",
    name_zh: "高效清潔組",
    name_original: "Raccoon Home Clean Set",
    category: "生活用品",
    price: 520,
    image_url: "/assets/p003.png",
    product_url: "/products/P003",
    description_zh: "小空間與租屋族適用的清潔組合，方便收納，適合日常快速整理。",
    tags: ["租屋", "清潔", "預算友善", "居家"],
    use_cases: ["居家清潔", "租屋生活", "日常使用"],
    stock_status: "有庫存"
  },
  {
    code: "P004",
    name_zh: "質感禮品杯",
    name_original: "Raccoon Daily Mug",
    category: "生活用品",
    price: 680,
    image_url: "/assets/p004.png",
    product_url: "/products/P004",
    description_zh: "適合辦公室與日常使用的質感馬克杯，包裝簡潔，適合作為小禮物。",
    tags: ["送禮", "辦公室", "日常", "預算友善"],
    use_cases: ["送禮", "辦公室", "日常使用"],
    stock_status: "少量庫存"
  }
];

const state = {
  messages: [
    {
      role: "ai",
      content: "你好，我可以回答退換貨、付款、配送、保固，也可以依預算與用途推薦商品。"
    }
  ],
  lastResult: null,
  tickets: [],
  selectedTicketId: null,
  sessionId: getSessionId(),
  accessCodeRequired: false,
  accessCode: sessionStorage.getItem("raccoon-demo-access-code") || ""
};

const els = {
  accessGate: document.querySelector("#access-gate"),
  accessForm: document.querySelector("#access-form"),
  accessInput: document.querySelector("#access-code-input"),
  accessError: document.querySelector("#access-error"),
  chatView: document.querySelector("#chat-view"),
  adminView: document.querySelector("#admin-view"),
  productView: document.querySelector("#product-view"),
  messages: document.querySelector("#messages"),
  form: document.querySelector("#chat-form"),
  input: document.querySelector("#message-input"),
  sendBtn: document.querySelector("#send-btn"),
  decisionGrid: document.querySelector("#decision-grid"),
  reasonList: document.querySelector("#reason-list"),
  decisionBadge: document.querySelector("#decision-badge"),
  productList: document.querySelector("#product-list"),
  productCount: document.querySelector("#product-count"),
  healthPill: document.querySelector("#health-pill"),
  modePill: document.querySelector("#mode-pill"),
  ticketList: document.querySelector("#ticket-list"),
  ticketDetail: document.querySelector("#ticket-detail")
};

init();

function init() {
  renderMessages();
  bindEvents();
  checkHealth();
  route();
}

function bindEvents() {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = els.input.value.trim();
    if (!value) return;
    els.input.value = "";
    await sendMessage(value);
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.dataset.prompt));
  });

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.route));
  });

  document.querySelector("#refresh-tickets").addEventListener("click", loadTickets);
  els.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.accessCode = els.accessInput.value.trim();
    sessionStorage.setItem("raccoon-demo-access-code", state.accessCode);
    els.accessError.textContent = "";
    els.accessGate.classList.add("hidden");
    await checkAccessCode();
  });
  window.addEventListener("popstate", route);
}

async function sendMessage(content) {
  state.messages.push({ role: "customer", content });
  renderMessages();
  setSending(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: content,
        sessionId: state.sessionId,
        accessCode: state.accessCode
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "送出失敗");

    state.lastResult = data;
    state.messages.push({
      role: data.decision?.decision === "needs_review" ? "system" : "ai",
      content: data.reply
    });
    renderMessages();
    renderDecision(data);
    renderProducts(data.recommendedProducts || []);
  } catch (error) {
    if (error.message.includes("access code")) {
      showAccessGate("展示碼不正確，請重新輸入。");
    }
    state.messages.push({
      role: "system",
      content: `目前無法完成回覆：${error.message}`
    });
    renderMessages();
  } finally {
    setSending(false);
  }
}

function renderMessages() {
  els.messages.innerHTML = state.messages
    .map((message) => `<div class="message ${message.role}">${escapeHtml(message.content)}</div>`)
    .join("");
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderDecision(data) {
  const classification = data.classification || {};
  const decision = data.decision || {};
  const values = [
    ["intent", classification.intent || "-"],
    ["confidence", Number(classification.confidence || 0).toFixed(2)],
    ["tone", classification.tone || "-"],
    ["decision", decision.decision || "-"]
  ];

  els.decisionGrid.innerHTML = values
    .map(([key, value]) => `<div><dt>${key}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  els.decisionBadge.textContent = decision.decision || "已判斷";
  els.decisionBadge.className = `badge ${decision.decision === "needs_review" ? "warn" : ""}`;
  els.reasonList.innerHTML = [
    ...(decision.reasons || []),
    data.matchedFaq ? `命中 FAQ：${data.matchedFaq.code} ${data.matchedFaq.title}` : "",
    decision.handoffReason ? `轉人工原因：${decision.handoffReason}` : ""
  ]
    .filter(Boolean)
    .map((reason) => `<div class="reason">${escapeHtml(reason)}</div>`)
    .join("");
}

function renderProducts(products) {
  els.productCount.textContent = String(products.length);
  if (!products.length) {
    els.productList.innerHTML = '<div class="empty">這次沒有商品推薦。</div>';
    return;
  }

  els.productList.innerHTML = products.map(productCard).join("");
}

function productCard(product) {
  return `
    <article class="product-card">
      <img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name_zh)}">
      <div>
        <h3>${escapeHtml(product.code)}｜${escapeHtml(product.name_zh)}</h3>
        <div class="original">${escapeHtml(product.name_original || "")}</div>
        <div class="product-meta">
          <span>NT$ ${formatPrice(product.price)}</span>
          <span>${escapeHtml(product.stock_status || "")}</span>
        </div>
        <p>${escapeHtml(product.description_zh || "")}</p>
        <a href="${escapeAttr(product.product_url || `/products/${product.code}`)}">查看商品詳情</a>
      </div>
    </article>
  `;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    state.accessCodeRequired = Boolean(data.accessCodeRequired);
    els.healthPill.textContent = data.groqConfigured ? "Groq 已設定" : "Groq 未設定";
    els.healthPill.className = `status-pill ${data.groqConfigured ? "" : "warn"}`;
    els.modePill.textContent = data.mode;
    if (state.accessCodeRequired && !state.accessCode) showAccessGate("");
  } catch {
    els.healthPill.textContent = "API 未連線";
    els.healthPill.className = "status-pill warn";
  }
}

async function loadTickets() {
  if (state.accessCodeRequired && !state.accessCode) {
    showAccessGate("");
    return;
  }

  els.ticketList.innerHTML = '<div class="empty">載入中...</div>';
  try {
    const response = await fetch("/api/tickets", {
      headers: accessHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "讀取失敗");
    state.tickets = data.tickets || [];
    if (!state.selectedTicketId && state.tickets.length) {
      state.selectedTicketId = state.tickets[0].id;
    }
    renderTickets();
  } catch (error) {
    if (error.message.includes("access code")) {
      showAccessGate("展示碼不正確，請重新輸入。");
    }
    els.ticketList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderTickets() {
  if (!state.tickets.length) {
    els.ticketList.innerHTML = '<div class="empty">目前沒有工單。</div>';
    els.ticketDetail.innerHTML = '<div class="empty">選擇一張工單查看細節。</div>';
    return;
  }

  els.ticketList.innerHTML = state.tickets
    .map((ticket) => `
      <article class="ticket-card ${ticket.id === state.selectedTicketId ? "active" : ""}" data-ticket-id="${escapeAttr(ticket.id)}">
        <div class="ticket-no">${escapeHtml(ticket.ticket_no)}</div>
        <div class="product-meta">
          <span>${escapeHtml(ticket.status || "-")}</span>
          <span>${escapeHtml(ticket.intent || "-")}</span>
        </div>
        <div class="ticket-summary">${escapeHtml(ticket.summary || "")}</div>
      </article>
    `)
    .join("");

  els.ticketList.querySelectorAll("[data-ticket-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedTicketId = card.dataset.ticketId;
      renderTickets();
    });
  });

  renderTicketDetail(state.tickets.find((ticket) => ticket.id === state.selectedTicketId));
}

function renderTicketDetail(ticket) {
  if (!ticket) {
    els.ticketDetail.innerHTML = '<div class="empty">選擇一張工單查看細節。</div>';
    return;
  }

  const decision = ticket.ai_decision || {};
  els.ticketDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(ticket.ticket_no)}</h2>
        <p class="ticket-summary">${escapeHtml(ticket.summary || "")}</p>
      </div>
      <span class="badge ${ticket.status === "needs_review" ? "warn" : ""}">${escapeHtml(ticket.status || "-")}</span>
    </div>
    <dl class="decision-grid">
      <div><dt>intent</dt><dd>${escapeHtml(decision.intent || ticket.intent || "-")}</dd></div>
      <div><dt>confidence</dt><dd>${formatConfidence(decision.confidence)}</dd></div>
      <div><dt>decision</dt><dd>${escapeHtml(decision.decision || "-")}</dd></div>
      <div><dt>handoff</dt><dd>${escapeHtml(decision.handoff_reason || "-")}</dd></div>
    </dl>
    <div class="timeline">
      ${(ticket.messages || []).map((message) => `
        <div class="timeline-item">
          <div class="timeline-role">${escapeHtml(message.role)}</div>
          <div>${escapeHtml(message.content)}</div>
        </div>
      `).join("")}
    </div>
    <form class="reply-box" data-reply-form>
      <textarea name="content" placeholder="輸入 mock 客服回覆"></textarea>
      <button type="submit">新增客服回覆</button>
    </form>
  `;

  els.ticketDetail.querySelector("[data-reply-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = new FormData(event.currentTarget).get("content").trim();
    if (!content) return;
    await postAgentReply(ticket.id, content);
  });
}

async function postAgentReply(ticketId, content) {
  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json", ...accessHeaders() },
    body: JSON.stringify({ content, staffName: "Demo Agent", accessCode: state.accessCode })
  });
  const data = await response.json();
  if (!response.ok) {
    alert(data.message || "回覆失敗");
    return;
  }
  await loadTickets();
}

async function checkAccessCode() {
  if (!state.accessCodeRequired) return;

  const response = await fetch("/api/tickets", {
    headers: accessHeaders()
  });
  if (response.status === 401) {
    showAccessGate("展示碼不正確，請重新輸入。");
    return;
  }
  if (window.location.pathname === "/admin") await loadTickets();
}

function accessHeaders() {
  return state.accessCode ? { "x-demo-access-code": state.accessCode } : {};
}

function showAccessGate(message) {
  sessionStorage.removeItem("raccoon-demo-access-code");
  state.accessCode = "";
  els.accessError.textContent = message || "";
  els.accessGate.classList.remove("hidden");
  els.accessInput.focus();
}

function route() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === (path === "/admin" ? "/admin" : "/"));
  });

  els.chatView.classList.add("hidden");
  els.adminView.classList.add("hidden");
  els.productView.classList.add("hidden");

  const productMatch = path.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    renderProductDetail(productMatch[1]);
    els.productView.classList.remove("hidden");
    return;
  }

  if (path === "/admin") {
    els.adminView.classList.remove("hidden");
    loadTickets();
    return;
  }

  els.chatView.classList.remove("hidden");
}

function renderProductDetail(code) {
  const product = PRODUCTS.find((item) => item.code.toLowerCase() === code.toLowerCase());
  if (!product) {
    els.productView.innerHTML = '<div class="empty">找不到這個商品。</div>';
    return;
  }

  els.productView.innerHTML = `
    <div class="product-detail">
      <img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name_zh)}">
      <div class="detail-info">
        <div>
          <h1>${escapeHtml(product.code)}｜${escapeHtml(product.name_zh)}</h1>
          <p class="original">${escapeHtml(product.name_original)}</p>
        </div>
        <div class="product-meta">
          <span>NT$ ${formatPrice(product.price)}</span>
          <span>${escapeHtml(product.category)}</span>
          <span>${escapeHtml(product.stock_status)}</span>
        </div>
        <p>${escapeHtml(product.description_zh)}</p>
        <div class="tag-row">
          ${[...product.tags, ...product.use_cases].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <button onclick="history.back()">返回</button>
      </div>
    </div>
  `;
}

function navigate(path) {
  history.pushState({}, "", path);
  route();
}

function setSending(isSending) {
  els.sendBtn.disabled = isSending;
  els.sendBtn.textContent = isSending ? "處理中" : "送出";
}

function getSessionId() {
  const existing = localStorage.getItem("raccoon-session-id");
  if (existing) return existing;
  const value = `web-${crypto.randomUUID()}`;
  localStorage.setItem("raccoon-session-id", value);
  return value;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("zh-TW");
}

function formatConfidence(value) {
  return value == null ? "-" : Number(value).toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
