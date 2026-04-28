export function formatAssistantReply(value) {
  return insertSentenceBreaks(enforceCustomerPronouns(stripMarkdown(String(value || "")))).trim();
}

export function stripMarkdown(value) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "");
}

export function enforceCustomerPronouns(value) {
  return value
    .replace(/你們/g, "您")
    .replace(/妳們/g, "您")
    .replace(/[你妳]/g, "您");
}

function insertSentenceBreaks(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/([。！？!?])[ \t]*(?=[^\n])/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n");
}
