export function findBestFaq(faqs, message) {
  const text = normalize(message);
  let best = null;
  let bestScore = 0;

  for (const faq of faqs) {
    const keywords = Array.isArray(faq.keywords) ? faq.keywords : [];
    const searchable = normalize([
      faq.code,
      faq.title,
      faq.question,
      faq.answer,
      ...keywords
    ].join(" "));

    let score = 0;
    for (const keyword of keywords) {
      const normalizedKeyword = normalize(keyword);
      if (normalizedKeyword && text.includes(normalizedKeyword)) score += 4;
    }

    if (searchable && textIncludesAny(searchable, text)) score += 1;

    if (score > bestScore) {
      best = faq;
      bestScore = score;
    }
  }

  return bestScore >= 4 ? best : null;
}

function textIncludesAny(searchable, text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => token.length >= 2 && searchable.includes(token));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
