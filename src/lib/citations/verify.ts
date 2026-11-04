/**
 * Deterministic citation verification.
 *
 * Every claim and every drafted sentence carries a verbatim quote plus the
 * exhibit page it came from. Before anything is persisted we check the quote
 * actually occurs on that page. This is a cheap, model-free guard against
 * fabricated citations; the LLM judge (evals/) checks the harder question of
 * whether the quote *supports* the sentence.
 */

export type QuoteMatch =
  | { verified: true; method: 'exact' | 'normalized' | 'fuzzy'; score: number }
  | { verified: false; method: 'none'; score: number };

const FUZZY_THRESHOLD = 0.9;
const MIN_QUOTE_TOKENS = 3;

/** Collapse PDF extraction artifacts: ligatures, smart quotes, hyphenated line breaks, whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // de-hyphenate across line breaks
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(s: string): string[] {
  return normalizeText(s)
    .replace(/[^\p{L}\p{N}$%.\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/\.$/, ''))
    .filter(Boolean);
}

/**
 * Best fraction of quote tokens matched in order inside any same-length window
 * of the page. Tolerates small OCR/extraction differences but not paraphrase.
 */
function fuzzyScore(quoteTokens: string[], pageTokens: string[]): number {
  const n = quoteTokens.length;
  if (n === 0 || pageTokens.length === 0) return 0;
  const first = new Set(quoteTokens.slice(0, 3));
  let best = 0;
  const slack = Math.ceil(n * 0.15);
  for (let start = 0; start < pageTokens.length; start++) {
    if (!first.has(pageTokens[start])) continue;
    const window = pageTokens.slice(start, start + n + slack);
    // longest common subsequence, bounded window so this stays cheap
    const dp = new Array(window.length + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      let prev = 0;
      for (let j = 1; j <= window.length; j++) {
        const tmp = dp[j];
        dp[j] = quoteTokens[i - 1] === window[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    best = Math.max(best, dp[window.length] / n);
    if (best === 1) break;
  }
  return best;
}

export function verifyQuote(quote: string, pageText: string): QuoteMatch {
  if (!quote.trim() || !pageText.trim()) return { verified: false, method: 'none', score: 0 };
  if (pageText.includes(quote)) return { verified: true, method: 'exact', score: 1 };

  const nq = normalizeText(quote);
  const np = normalizeText(pageText);
  if (nq.length > 0 && np.includes(nq)) return { verified: true, method: 'normalized', score: 1 };

  const qt = tokenize(quote);
  if (qt.length < MIN_QUOTE_TOKENS) return { verified: false, method: 'none', score: 0 };
  const score = fuzzyScore(qt, tokenize(pageText));
  return score >= FUZZY_THRESHOLD
    ? { verified: true, method: 'fuzzy', score }
    : { verified: false, method: 'none', score };
}

export type Citation = { claimId: string; exhibitLabel: string; page: number; quote: string };
export type CitedSentence = { text: string; citations: Citation[] };

/**
 * Enforce "no source, no sentence": drop citations whose quote is not on the
 * cited page, then drop sentences left with no valid citation.
 */
export function enforceCitations(
  sentences: CitedSentence[],
  getPage: (exhibitLabel: string, page: number) => string | undefined,
): { kept: CitedSentence[]; dropped: { sentence: CitedSentence; reason: string }[] } {
  const kept: CitedSentence[] = [];
  const dropped: { sentence: CitedSentence; reason: string }[] = [];
  for (const s of sentences) {
    const valid = s.citations.filter((c) => {
      const page = getPage(c.exhibitLabel, c.page);
      return page !== undefined && verifyQuote(c.quote, page).verified;
    });
    if (valid.length === 0) {
      dropped.push({ sentence: s, reason: s.citations.length === 0 ? 'no citation' : 'citation quote not found on cited page' });
    } else {
      kept.push({ text: s.text, citations: valid });
    }
  }
  return { kept, dropped };
}

/** Remove internal claim handles the model sometimes leaks into prose, e.g. "(C3)", "[C1][C15]", "(C2, C4)". */
export function stripClaimHandles(text: string) {
  return text
    .replace(/\s*[[(]\s*(?:e\.g\.,?\s*)?C\d+(?:\s*[,;/]\s*C\d+)*\s*[\])]/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Clean the edges of an excerpt cut from a chunk: drop a leading word fragment
 * ("oner may submit" -> "...may submit"), a stray opening quote or footnote
 * number, and mark any cut with an ellipsis. The rest stays verbatim.
 */
export function tidyExcerpt(text: string) {
  let t = text.trim().replace(/^["“”]+\s*/, '');
  let cut = false;
  if (/^\d{1,2}\s+[A-Z]/.test(t)) t = t.replace(/^\d{1,2}\s+/, ''); // footnote marker
  if (/^[a-z]/.test(t)) {
    t = t.replace(/^\S+\s+/, '');
    cut = true;
  }
  return `${cut ? '…' : ''}${t}`;
}
