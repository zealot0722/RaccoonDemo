export function formatAssistantReply(value) {
  return insertSentenceBreaks(stripMarkdown(String(value || ""))).trim();
}

export function stripMarkdown(value) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "");
}

function insertSentenceBreaks(value) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/([。！？!?])[ \t]*(?=[^\n])/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n");
}
