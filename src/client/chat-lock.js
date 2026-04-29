export const FEEDBACK_COMPLETION_MESSAGE = "請關閉此視窗，如有其他需求請重新整理或另開視窗。";

export function canSendChatMessage(state = {}) {
  return !state.chatLocked;
}

export function lockChatAfterFeedback(state, ticketId) {
  if (!ticketId || state.feedbackSubmittedFor?.has(ticketId)) return false;

  state.feedbackSubmittedFor.add(ticketId);
  state.chatLocked = true;
  state.pendingAttachments = [];
  state.messages.push({
    role: "system",
    content: FEEDBACK_COMPLETION_MESSAGE
  });

  return true;
}
