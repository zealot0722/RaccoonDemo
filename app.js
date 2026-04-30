import { canSendChatMessage, lockChatAfterFeedback } from "./src/client/chat-lock.js";
import {
  TICKET_FILTER_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_OPTIONS,
  filterTicketsBySegment,
  getTicketFilterLabel,
  getTicketPriorityMeta,
  getTicketStatusMeta,
  summarizeTicketStats
} from "./src/client/ticket-ui.js";

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

const CHAT_STATE_KEY = "raccoon-chat-state";
const DEFAULT_MESSAGES = [
  {
    role: "ai",
    content: "您好，歡迎使用 Raccoon 客服。\n很高興為您服務，您可以直接描述遇到的問題，或告訴我想找什麼樣的商品。"
  }
];
const restoredState = loadConversationState();

const state = {
  messages: restoredState.messages || DEFAULT_MESSAGES.map((message) => ({ ...message })),
  productHistory: restoredState.productHistory || [],
  pendingAttachments: [],
  lastResult: restoredState.lastResult || null,
  tickets: [],
  selectedTicketId: null,
  activeTicketFilter: "all",
  sessionId: restoredState.sessionId || getSessionId(),
  accessCodeRequired: false,
  accessCode: sessionStorage.getItem("raccoon-demo-access-code") || "",
  feedbackSubmittedFor: new Set(restoredState.feedbackSubmittedFor || []),
  chatLocked: Boolean(restoredState.chatLocked)
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
  attachBtn: document.querySelector("#attach-btn"),
  photoInput: document.querySelector("#photo-input"),
  attachmentPreview: document.querySelector("#attachment-preview"),
  feedbackPanel: document.querySelector("#feedback-panel"),
  ratingRow: document.querySelector("#rating-row"),
  feedbackComment: document.querySelector("#feedback-comment"),
  feedbackStatus: document.querySelector("#feedback-status"),
  productHistoryDock: document.querySelector("#product-history-dock"),
  healthPill: document.querySelector("#health-pill"),
  modePill: document.querySelector("#mode-pill"),
  ticketStats: document.querySelector("#ticket-stats"),
  ticketList: document.querySelector("#ticket-list"),
  ticketDetail: document.querySelector("#ticket-detail")
};

init();

function init() {
  renderMessages();
  renderFeedbackPanel();
  renderProductHistory();
  setSending(false);
  bindEvents();
  checkHealth();
  route();
}

function bindEvents() {
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = els.input.value.trim();
    const attachments = state.pendingAttachments;
    if (!value && !attachments.length) return;
    els.input.value = "";
    state.pendingAttachments = [];
    renderAttachmentPreview();
    await sendMessage(value, attachments);
  });

  els.attachBtn.addEventListener("click", () => {
    if (!canSendChatMessage(state)) return;
    els.photoInput.click();
  });
  els.photoInput.addEventListener("change", async () => {
    await addPhotoAttachments(Array.from(els.photoInput.files || []));
    els.photoInput.value = "";
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!canSendChatMessage(state)) return;
      sendMessage(button.dataset.prompt);
    });
  });

  document.addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      event.preventDefault();
      navigate(routeButton.dataset.route);
      return;
    }

    const appLink = event.target.closest("a[data-app-route]");
    if (!appLink || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(new URL(appLink.href).pathname);
  });

  document.querySelector("#refresh-tickets").addEventListener("click", loadTickets);
  els.ratingRow.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-score]");
    if (!button) return;
    await submitFeedback(Number(button.dataset.score));
  });

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

async function sendMessage(content, attachments = []) {
  if (!canSendChatMessage(state)) return;

  const outgoingContent = content || "已上傳商品照片";
  state.messages.push({ role: "customer", content: outgoingContent, attachments });
  state.lastResult = null;
  persistConversationState();
  renderMessages();
  renderFeedbackPanel();
  setSending(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: content,
        sessionId: state.sessionId,
        accessCode: state.accessCode,
        attachments
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "送出失敗");

    state.lastResult = data;
    rememberRecommendedProducts(data.recommendedProducts || []);
    state.messages.push({
      role: data.decision?.decision === "needs_review" ? "system" : "ai",
      content: data.reply,
      products: data.recommendedProducts || [],
      ticketId: data.ticket?.id
    });
    if (data.autoClosed) {
      state.chatLocked = true;
      state.pendingAttachments = [];
    }
    persistConversationState({ force: Boolean(data.autoClosed) });
    renderMessages();
    renderFeedbackPanel();
    renderProductHistory();
  } catch (error) {
    if (error.message.includes("access code")) {
      showAccessGate("試用碼不正確，請重新輸入。");
    }
    state.messages.push({
      role: "system",
      content: `目前無法完成回覆：${error.message}`
    });
    persistConversationState();
    renderMessages();
  } finally {
    setSending(false);
  }
}

function renderMessages() {
  els.messages.innerHTML = state.messages
    .map((message) => `
      <div class="message ${message.role}">
        <div class="message-content">${escapeHtml(message.content)}</div>
        ${message.attachments?.length ? renderAttachments(message.attachments) : ""}
        ${message.products?.length ? renderMessageProducts(message.products) : ""}
      </div>
    `)
    .join("");
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderAttachments(attachments) {
  return `
    <div class="message-attachments">
      ${attachments.map((item) => `
        <figure class="message-attachment">
          <img src="${escapeAttr(item.dataUrl || item.data_url || "")}" alt="${escapeAttr(item.name || "上傳照片")}">
          <figcaption>${escapeHtml(item.name || "上傳照片")}</figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

async function addPhotoAttachments(files) {
  const images = files.filter((file) => file.type.startsWith("image/")).slice(0, 3);
  const next = [];
  for (const file of images) {
    if (file.size > 2_000_000) {
      state.messages.push({
        role: "system",
        content: `${file.name} 超過 2MB，請選擇較小的圖片。`
      });
      continue;
    }
    next.push({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file)
    });
  }
  state.pendingAttachments = [...state.pendingAttachments, ...next].slice(0, 3);
  renderAttachmentPreview();
  renderMessages();
}

function renderAttachmentPreview() {
  if (!state.pendingAttachments.length) {
    els.attachmentPreview.classList.add("hidden");
    els.attachmentPreview.innerHTML = "";
    return;
  }

  els.attachmentPreview.classList.remove("hidden");
  els.attachmentPreview.innerHTML = state.pendingAttachments.map((item, index) => `
    <button type="button" class="attachment-chip" data-remove-attachment="${index}">
      <img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.name)}">
      <span>${escapeHtml(item.name)}</span>
    </button>
  `).join("");

  els.attachmentPreview.querySelectorAll("[data-remove-attachment]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingAttachments.splice(Number(button.dataset.removeAttachment), 1);
      renderAttachmentPreview();
    });
  });
}

function renderMessageProducts(products) {
  return `
    <div class="message-products">
      ${products.map((product) => `
        <article class="message-product">
          <img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name_zh)}">
          <div>
            <h3>${escapeHtml(product.code)}｜${escapeHtml(product.name_zh)}</h3>
            <div class="original">${escapeHtml(product.name_original || "")}</div>
            <div class="product-meta">
              <span>NT$ ${formatPrice(product.price)}</span>
              <span>${escapeHtml(product.stock_status || "")}</span>
            </div>
            <p>${escapeHtml(product.description_zh || "")}</p>
            <a data-app-route href="${escapeAttr(product.product_url || `/products/${product.code}`)}">查看商品詳情</a>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function rememberRecommendedProducts(products) {
  if (!products.length) return;

  const byCode = new Map(state.productHistory.map((product) => [product.code, product]));
  for (const product of products) {
    byCode.set(product.code, product);
  }
  state.productHistory = Array.from(byCode.values()).slice(-6);
}

function renderProductHistory() {
  if (!els.productHistoryDock) return;
  const isCustomerPage = window.location.pathname === "/";
  if (!isCustomerPage || !state.productHistory.length) {
    els.productHistoryDock.classList.add("hidden");
    els.productHistoryDock.innerHTML = "";
    return;
  }

  els.productHistoryDock.classList.remove("hidden");
  els.productHistoryDock.innerHTML = `
    <div class="history-title">剛剛推薦過</div>
    <div class="history-list">
      ${state.productHistory.map((product) => `
        <a class="history-product" data-app-route href="${escapeAttr(product.product_url || `/products/${product.code}`)}">
          <img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.name_zh)}">
          <span>
            <strong>${escapeHtml(product.name_zh)}</strong>
            <em>${escapeHtml(product.code)}｜NT$ ${formatPrice(product.price)}</em>
          </span>
        </a>
      `).join("")}
    </div>
  `;
}

function renderFeedbackPanel() {
  const ticketId = state.lastResult?.ticket?.id;
  if (!ticketId || !state.lastResult?.conversationEnded || state.feedbackSubmittedFor.has(ticketId)) {
    els.feedbackPanel.classList.add("hidden");
    return;
  }

  els.feedbackPanel.classList.remove("hidden");
  els.feedbackStatus.textContent = "";
  els.feedbackComment.value = "";
}

async function submitFeedback(score) {
  const ticketId = state.lastResult?.ticket?.id;
  if (!ticketId) return;

  els.feedbackStatus.textContent = "正在寫入評分...";
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticketId,
        score,
        comment: els.feedbackComment.value.trim(),
        sessionId: state.sessionId,
        accessCode: state.accessCode
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "評分寫入失敗");
    lockChatAfterFeedback(state, ticketId);
    localStorage.removeItem("raccoon-session-id");
    clearConversationState();
    renderMessages();
    renderAttachmentPreview();
    renderFeedbackPanel();
    setSending(false);
  } catch (error) {
    els.feedbackStatus.textContent = `評分寫入失敗：${error.message}`;
  }
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
    els.healthPill.textContent = "API 無回應";
    els.healthPill.className = "status-pill warn";
  }
}

async function loadTickets() {
  if (state.accessCodeRequired && !state.accessCode) {
    showAccessGate("");
    return;
  }

  els.ticketList.innerHTML = '<div class="empty">讀取中...</div>';
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
    renderTicketStats();
    renderTickets();
  } catch (error) {
    if (error.message.includes("access code")) {
      showAccessGate("試用碼不正確，請重新輸入。");
    }
    els.ticketList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderTickets() {
  if (!state.tickets.length) {
    renderTicketStats();
    els.ticketList.innerHTML = '<div class="empty">目前沒有工單。</div>';
    els.ticketDetail.innerHTML = '<div class="empty">請選擇一張工單查看細節。</div>';
    return;
  }

  const visibleTickets = filterTicketsBySegment(state.tickets, state.activeTicketFilter);
  if (!visibleTickets.some((ticket) => ticket.id === state.selectedTicketId)) {
    state.selectedTicketId = visibleTickets[0]?.id || null;
  }

  if (!visibleTickets.length) {
    const label = getTicketFilterLabel(state.activeTicketFilter);
    els.ticketList.innerHTML = `<div class="empty">目前沒有${escapeHtml(label)}工單。</div>`;
    els.ticketDetail.innerHTML = '<div class="empty">請選擇其他分類查看工單。</div>';
    return;
  }

  els.ticketList.innerHTML = visibleTickets
    .map((ticket) => {
      const statusMeta = getTicketStatusMeta(ticket.status);
      const priorityMeta = getTicketPriorityMeta(ticket.priority, ticket.ai_decision?.tone);
      return `
      <article class="ticket-card ${ticket.id === state.selectedTicketId ? "active" : ""} ${priorityMeta.className === "warn" ? "urgent" : ""}" data-ticket-id="${escapeAttr(ticket.id)}">
        <div class="ticket-card-head">
          <div class="ticket-no">${escapeHtml(ticket.ticket_no)}</div>
          <span class="ticket-time">${formatTimeAgo(ticket.created_at)}</span>
        </div>
        <div class="badge-row">
          <span class="badge ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
          <span class="badge ${priorityMeta.className}">${escapeHtml(priorityMeta.label)}</span>
          <span class="badge ghost">${escapeHtml(ticket.intent || "-")}</span>
        </div>
        <div class="ticket-summary">${escapeHtml(ticket.summary || "")}</div>
        ${ticket.feedback ? `<div class="ticket-score">CSAT ${escapeHtml(ticket.feedback.score)}/5</div>` : ""}
      </article>
    `;
    })
    .join("");

  els.ticketList.querySelectorAll("[data-ticket-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedTicketId = card.dataset.ticketId;
      renderTickets();
    });
  });

  renderTicketDetail(visibleTickets.find((ticket) => ticket.id === state.selectedTicketId));
}

function renderTicketStats() {
  if (!els.ticketStats) return;
  const stats = summarizeTicketStats(state.tickets);
  const counts = {
    all: stats.total,
    unfinished: stats.unfinished,
    needs_review: stats.needsReview,
    urgent: stats.urgent,
    completed: stats.completed
  };
  els.ticketStats.innerHTML = TICKET_FILTER_OPTIONS.map((option) => `
    <button
      type="button"
      class="stat-item ${option.value === "urgent" ? "warn" : ""} ${state.activeTicketFilter === option.value ? "active" : ""}"
      data-ticket-filter="${escapeAttr(option.value)}"
      aria-pressed="${state.activeTicketFilter === option.value ? "true" : "false"}"
    >
      <span>${escapeHtml(option.label)}</span>
      <strong>${counts[option.value] || 0}</strong>
    </button>
  `).join("");

  els.ticketStats.querySelectorAll("[data-ticket-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTicketFilter = button.dataset.ticketFilter || "all";
      renderTicketStats();
      renderTickets();
    });
  });
}

function renderTicketDetail(ticket) {
  if (!ticket) {
    els.ticketDetail.innerHTML = '<div class="empty">請選擇一張工單查看細節。</div>';
    return;
  }

  const decision = ticket.ai_decision || {};
  const decisionAttachments = getDecisionAttachments(ticket, decision);
  const statusMeta = getTicketStatusMeta(ticket.status);
  const priorityMeta = getTicketPriorityMeta(ticket.priority, decision.tone);
  els.ticketDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(ticket.ticket_no)}</h2>
        <p class="ticket-summary">${escapeHtml(ticket.summary || "")}</p>
      </div>
      <div class="detail-badges">
        <span class="badge ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
        <span class="badge ${priorityMeta.className}">${escapeHtml(priorityMeta.label)}</span>
      </div>
    </div>
    <form class="ticket-update-panel" data-ticket-update-form>
      <label>
        <span>後續處置</span>
        <select name="status">
          ${TICKET_STATUS_OPTIONS.map((option) => `
            <option value="${escapeAttr(option.value)}" ${option.value === ticket.status ? "selected" : ""}>${escapeHtml(option.label)}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>工單分級</span>
        <select name="priority">
          ${TICKET_PRIORITY_OPTIONS.map((option) => `
            <option value="${escapeAttr(option.value)}" ${option.value === (ticket.priority || "normal") ? "selected" : ""}>${escapeHtml(option.label)}</option>
          `).join("")}
        </select>
      </label>
      <button type="submit">儲存</button>
      <div class="update-status" data-update-status></div>
    </form>
    <dl class="decision-grid">
      <div><dt>intent</dt><dd>${escapeHtml(decision.intent || ticket.intent || "-")}</dd></div>
      <div><dt>confidence</dt><dd>${formatConfidence(decision.confidence)}</dd></div>
      <div><dt>decision</dt><dd>${escapeHtml(decision.decision || "-")}</dd></div>
      <div><dt>handoff</dt><dd>${escapeHtml(decision.handoff_reason || "-")}</dd></div>
      <div><dt>products</dt><dd>${formatProductCodes(decision.recommended_product_codes)}</dd></div>
      <div><dt>CSAT</dt><dd>${ticket.feedback ? `${escapeHtml(ticket.feedback.score)}/5` : "-"}</dd></div>
    </dl>
    ${ticket.feedback?.comment ? `<div class="feedback-note">客戶回饋：${escapeHtml(ticket.feedback.comment)}</div>` : ""}
    ${decisionAttachments.length ? `
      <div class="timeline-item">
        <div class="timeline-role">退貨附件</div>
        ${renderAttachments(decisionAttachments)}
      </div>
    ` : ""}
    <div class="timeline">
      ${(ticket.messages || []).map((message) => `
        <div class="timeline-item">
          <div class="timeline-role">${escapeHtml(message.role)}</div>
          <div>${escapeHtml(message.content)}</div>
          ${message.attachments?.length ? renderAttachments(message.attachments) : ""}
        </div>
      `).join("")}
    </div>
    <form class="reply-box" data-reply-form>
      <textarea name="content" placeholder="輸入 mock 客服回覆"></textarea>
      <button type="submit">送出客服回覆</button>
    </form>
  `;

  els.ticketDetail.querySelector("[data-reply-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = new FormData(event.currentTarget).get("content").trim();
    if (!content) return;
    await postAgentReply(ticket.id, content);
  });

  els.ticketDetail.querySelector("[data-ticket-update-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await updateTicket(ticket.id, {
      status: formData.get("status"),
      priority: formData.get("priority")
    });
  });
}

function getDecisionAttachments(ticket, decision) {
  const hasMessageAttachments = (ticket.messages || []).some((message) => message.attachments?.length);
  if (hasMessageAttachments) return [];
  const attachments = decision.raw_classification?.attachments;
  return Array.isArray(attachments) ? attachments : [];
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

async function updateTicket(ticketId, updates) {
  const statusEl = els.ticketDetail.querySelector("[data-update-status]");
  if (statusEl) statusEl.textContent = "儲存中...";

  const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...accessHeaders() },
    body: JSON.stringify({ ...updates, accessCode: state.accessCode })
  });
  const data = await response.json();

  if (!response.ok) {
    if (statusEl) statusEl.textContent = data.message || "儲存失敗";
    return;
  }

  const index = state.tickets.findIndex((ticket) => ticket.id === ticketId);
  if (index >= 0) state.tickets[index] = { ...state.tickets[index], ...data.ticket };
  if (statusEl) statusEl.textContent = "已更新";
  renderTicketStats();
  renderTickets();
}

async function checkAccessCode() {
  if (!state.accessCodeRequired) return;

  const response = await fetch("/api/tickets", {
    headers: accessHeaders()
  });
  if (response.status === 401) {
    showAccessGate("試用碼不正確，請重新輸入。");
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
    renderProductHistory();
    renderProductDetail(productMatch[1]);
    els.productView.classList.remove("hidden");
    return;
  }

  if (path === "/admin") {
    renderProductHistory();
    els.adminView.classList.remove("hidden");
    loadTickets();
    return;
  }

  els.chatView.classList.remove("hidden");
  renderProductHistory();
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
        <button type="button" data-route="/">返回客服</button>
      </div>
    </div>
  `;
}

function navigate(path) {
  history.pushState({}, "", path);
  route();
}

function setSending(isSending) {
  const locked = !canSendChatMessage(state);
  els.sendBtn.disabled = isSending || locked;
  els.input.disabled = locked;
  els.attachBtn.disabled = locked;
  els.photoInput.disabled = locked;
  els.form.classList.toggle("locked", locked);
  els.sendBtn.textContent = locked ? "已結束" : isSending ? "處理中" : "送出";
}

function loadConversationState() {
  try {
    const value = sessionStorage.getItem(CHAT_STATE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value);
    return {
      messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : null,
      productHistory: Array.isArray(parsed.productHistory) ? parsed.productHistory : [],
      lastResult: parsed.lastResult || null,
      sessionId: parsed.sessionId || "",
      feedbackSubmittedFor: Array.isArray(parsed.feedbackSubmittedFor) ? parsed.feedbackSubmittedFor : [],
      chatLocked: Boolean(parsed.chatLocked)
    };
  } catch {
    return {};
  }
}

function persistConversationState({ force = false } = {}) {
  if (state.chatLocked && !force) return;
  sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify({
    messages: state.messages,
    productHistory: state.productHistory,
    lastResult: state.lastResult,
    sessionId: state.sessionId,
    feedbackSubmittedFor: [...state.feedbackSubmittedFor],
    chatLocked: state.chatLocked
  }));
}

function clearConversationState() {
  sessionStorage.removeItem(CHAT_STATE_KEY);
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

function formatProductCodes(value) {
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "string") return value || "-";
  return "-";
}

function formatTimeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
