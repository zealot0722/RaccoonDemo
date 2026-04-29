import test from "node:test";
import assert from "node:assert/strict";

import {
  FEEDBACK_COMPLETION_MESSAGE,
  canSendChatMessage,
  lockChatAfterFeedback
} from "../src/client/chat-lock.js";

test("locks customer chat and appends a close-window notice after feedback", () => {
  const state = {
    messages: [],
    pendingAttachments: [{ name: "photo.jpg" }],
    feedbackSubmittedFor: new Set(),
    chatLocked: false
  };

  const locked = lockChatAfterFeedback(state, "ticket-1");

  assert.equal(locked, true);
  assert.equal(state.chatLocked, true);
  assert.equal(canSendChatMessage(state), false);
  assert.equal(state.pendingAttachments.length, 0);
  assert.equal(state.feedbackSubmittedFor.has("ticket-1"), true);
  assert.deepEqual(state.messages.at(-1), {
    role: "system",
    content: FEEDBACK_COMPLETION_MESSAGE
  });
});

test("does not append duplicate feedback completion notices", () => {
  const state = {
    messages: [],
    pendingAttachments: [],
    feedbackSubmittedFor: new Set(["ticket-1"]),
    chatLocked: true
  };

  const locked = lockChatAfterFeedback(state, "ticket-1");

  assert.equal(locked, false);
  assert.equal(state.messages.length, 0);
});
