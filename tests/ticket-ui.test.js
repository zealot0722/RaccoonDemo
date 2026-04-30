import test from "node:test";
import assert from "node:assert/strict";

import {
  filterTicketsBySegment,
  getTicketFilterLabel,
  getTicketPriorityMeta,
  getTicketStatusMeta,
  normalizeTicketUpdate,
  summarizeTicketStats
} from "../src/client/ticket-ui.js";

test("ticket status labels match admin workflow wording", () => {
  assert.deepEqual(getTicketStatusMeta("closed"), { label: "已完成", className: "done" });
  assert.deepEqual(getTicketStatusMeta("in_progress"), { label: "未完成", className: "info" });
  assert.deepEqual(getTicketStatusMeta("needs_review"), { label: "待接手", className: "warn" });
});

test("ticket priority marks high or angry tickets as urgent", () => {
  assert.deepEqual(getTicketPriorityMeta("high", "neutral"), { label: "緊急", className: "warn" });
  assert.deepEqual(getTicketPriorityMeta("normal", "angry"), { label: "緊急", className: "warn" });
  assert.deepEqual(getTicketPriorityMeta("normal", "neutral"), { label: "一般", className: "ghost" });
});

test("ticket stats count unfinished, urgent, and completed tickets", () => {
  const stats = summarizeTicketStats([
    { status: "needs_review", priority: "normal" },
    { status: "in_progress", priority: "high" },
    { status: "closed", priority: "normal" },
    { status: "auto_replied", priority: "normal", ai_decision: { tone: "angry" } }
  ]);

  assert.deepEqual(stats, {
    total: 4,
    unfinished: 3,
    needsReview: 1,
    urgent: 2,
    completed: 1
  });
});

test("ticket segment filters return only matching tickets", () => {
  const tickets = [
    { id: "t1", status: "needs_review", priority: "normal" },
    { id: "t2", status: "in_progress", priority: "high" },
    { id: "t3", status: "closed", priority: "normal" },
    { id: "t4", status: "auto_replied", priority: "normal", ai_decision: { tone: "angry" } }
  ];

  assert.deepEqual(filterTicketsBySegment(tickets, "all").map((ticket) => ticket.id), ["t1", "t2", "t3", "t4"]);
  assert.deepEqual(filterTicketsBySegment(tickets, "unfinished").map((ticket) => ticket.id), ["t1", "t2", "t4"]);
  assert.deepEqual(filterTicketsBySegment(tickets, "needs_review").map((ticket) => ticket.id), ["t1"]);
  assert.deepEqual(filterTicketsBySegment(tickets, "urgent").map((ticket) => ticket.id), ["t2", "t4"]);
  assert.deepEqual(filterTicketsBySegment(tickets, "completed").map((ticket) => ticket.id), ["t3"]);
});

test("ticket filter labels match the clickable admin categories", () => {
  assert.equal(getTicketFilterLabel("all"), "全部");
  assert.equal(getTicketFilterLabel("unfinished"), "未完成");
  assert.equal(getTicketFilterLabel("needs_review"), "待接手");
  assert.equal(getTicketFilterLabel("urgent"), "緊急");
  assert.equal(getTicketFilterLabel("completed"), "已完成");
});

test("ticket update only accepts known status and priority values", () => {
  assert.deepEqual(normalizeTicketUpdate({
    status: "closed",
    priority: "high",
    ignored: "value"
  }), {
    status: "closed",
    priority: "high"
  });
  assert.deepEqual(normalizeTicketUpdate({ status: "delete_everything", priority: "critical" }), {});
});
