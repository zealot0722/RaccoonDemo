export const TICKET_STATUS_OPTIONS = [
  { value: "needs_review", label: "待接手" },
  { value: "in_progress", label: "未完成" },
  { value: "closed", label: "已完成" },
  { value: "auto_replied", label: "AI 已回覆" }
];

export const TICKET_PRIORITY_OPTIONS = [
  { value: "normal", label: "一般" },
  { value: "high", label: "緊急" }
];

export function getTicketStatusMeta(status) {
  if (["closed", "resolved"].includes(status)) {
    return { label: "已完成", className: "done" };
  }

  if (status === "needs_review") {
    return { label: "待接手", className: "warn" };
  }

  if (status === "in_progress") {
    return { label: "未完成", className: "info" };
  }

  if (status === "auto_replied") {
    return { label: "AI 已回覆", className: "ghost" };
  }

  return { label: status || "未分類", className: "ghost" };
}

export function getTicketPriorityMeta(priority, tone) {
  if (priority === "high" || priority === "urgent" || tone === "angry") {
    return { label: "緊急", className: "warn" };
  }

  return { label: "一般", className: "ghost" };
}

export function summarizeTicketStats(tickets = []) {
  const stats = {
    total: tickets.length,
    unfinished: 0,
    needsReview: 0,
    urgent: 0,
    completed: 0
  };

  for (const ticket of tickets) {
    const status = ticket.status || "";
    const tone = ticket.ai_decision?.tone || ticket.tone;
    const priorityMeta = getTicketPriorityMeta(ticket.priority, tone);

    if (["closed", "resolved"].includes(status)) stats.completed += 1;
    else stats.unfinished += 1;

    if (status === "needs_review") stats.needsReview += 1;
    if (priorityMeta.label === "緊急") stats.urgent += 1;
  }

  return stats;
}

export function normalizeTicketUpdate(input = {}) {
  const updates = {};
  const allowedStatuses = new Set(TICKET_STATUS_OPTIONS.map((item) => item.value));
  const allowedPriorities = new Set(TICKET_PRIORITY_OPTIONS.map((item) => item.value));

  if (allowedStatuses.has(input.status)) updates.status = input.status;
  if (allowedPriorities.has(input.priority)) updates.priority = input.priority;

  return updates;
}
