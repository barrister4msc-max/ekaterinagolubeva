function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDocumentText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extracts one article only when clear legal-article boundaries exist.
 * Ambiguous or title-only input returns null.
 */
export function extractExactArticleText(documentText: string, article: string): string | null {
  const source = normalizeDocumentText(documentText);
  const articlePattern = escapeRegex(article.trim());
  if (!source || !articlePattern) return null;

  const start = new RegExp(
    "(?:^|\\n)\\s*Статья\\s+" + articlePattern + "(?:\\s*[.:-])?\\s*[^\\n]*",
    "giu",
  );
  const starts = [...source.matchAll(start)];
  if (starts.length !== 1 || starts[0].index == null) return null;

  const startIndex = starts[0].index;
  const contentStart = startIndex === 0 ? 0 : startIndex + 1;
  const next = /\n\s*Статья\s+\d+(?:\.\d+)*\b/giu;
  next.lastIndex = starts[0].index + starts[0][0].length;
  const nextMatch = next.exec(source);
  const endIndex = nextMatch?.index ?? source.length;
  const extracted = source.slice(contentStart, endIndex).trim();
  const headingLength = starts[0][0].length;
  const body = source
    .slice(startIndex + headingLength, endIndex)
    .trim();

  // The minimum-content guard applies to the article body, not its heading.
  return body.length >= 40 ? extracted : null;
}
