import { describe, expect, it } from 'vitest';
import { enforceCitations, normalizeText, stripClaimHandles, tidyExcerpt, verifyQuote } from './verify';

const page = `Dr. Priya Raman received the 2025 Turing Fellowship for Systems
Research, awarded to 3 of 1,140 nominees world-wide. The award com-
mittee cited her “contributions to fault-tolerant distributed storage”.`;

describe('verifyQuote', () => {
  it('accepts an exact substring', () => {
    expect(verifyQuote('awarded to 3 of 1,140 nominees', page)).toMatchObject({ verified: true, method: 'exact' });
  });

  it('accepts quotes that differ only by PDF artifacts (line breaks, hyphenation, smart quotes)', () => {
    const q = 'The award committee cited her "contributions to fault-tolerant distributed storage"';
    expect(verifyQuote(q, page)).toMatchObject({ verified: true, method: 'normalized' });
  });

  it('tolerates a single dropped token via fuzzy matching', () => {
    const q = 'Dr. Priya Raman received the 2025 Turing Fellowship for Research, awarded to 3 of 1,140 nominees';
    const r = verifyQuote(q, page);
    expect(r.verified).toBe(true);
    expect(r.method).toBe('fuzzy');
  });

  it('rejects paraphrase', () => {
    expect(verifyQuote('She won a very selective international systems prize', page).verified).toBe(false);
  });

  it('rejects a fabricated number', () => {
    expect(verifyQuote('awarded to 3 of 9,000 nominees world-wide', page).verified).toBe(false);
  });

  it('rejects empty and too-short quotes', () => {
    expect(verifyQuote('', page).verified).toBe(false);
    expect(verifyQuote('the xyz', page).verified).toBe(false);
  });
});

describe('normalizeText', () => {
  it('joins hyphenated line breaks', () => {
    expect(normalizeText('com-\nmittee')).toBe('committee');
  });
});

describe('enforceCitations', () => {
  const pages: Record<string, string> = { 'A:1': page };
  const get = (l: string, p: number) => pages[`${l}:${p}`];

  it('drops sentences with no citation or only invalid citations', () => {
    const { kept, dropped } = enforceCitations(
      [
        { text: 'Supported.', citations: [{ claimId: 'c1', exhibitLabel: 'A', page: 1, quote: 'awarded to 3 of 1,140 nominees' }] },
        { text: 'Uncited.', citations: [] },
        { text: 'Wrong page.', citations: [{ claimId: 'c2', exhibitLabel: 'A', page: 2, quote: 'awarded to 3 of 1,140 nominees' }] },
        { text: 'Fabricated.', citations: [{ claimId: 'c3', exhibitLabel: 'A', page: 1, quote: 'won the Nobel Prize in Physics' }] },
      ],
      get,
    );
    expect(kept.map((s) => s.text)).toEqual(['Supported.']);
    expect(dropped.map((d) => d.sentence.text)).toEqual(['Uncited.', 'Wrong page.', 'Fabricated.']);
  });

  it('keeps a sentence when at least one of several citations is valid, and strips the bad one', () => {
    const { kept } = enforceCitations(
      [
        {
          text: 'Mixed.',
          citations: [
            { claimId: 'c1', exhibitLabel: 'A', page: 1, quote: 'awarded to 3 of 1,140 nominees' },
            { claimId: 'c9', exhibitLabel: 'Z', page: 1, quote: 'nonexistent exhibit' },
          ],
        },
      ],
      get,
    );
    expect(kept[0].citations).toHaveLength(1);
  });
});

describe('stripClaimHandles', () => {
  it('removes bracketed and parenthesised claim handles the model leaks into prose', () => {
    expect(stripClaimHandles('He leads Ledgerline since 2022. [C1][C15][C17]')).toBe('He leads Ledgerline since 2022.');
    expect(stripClaimHandles('She won the Best Poster Award (C3), a local honor.')).toBe('She won the Best Poster Award, a local honor.');
    expect(stripClaimHandles('Two papers (C2, C4) were cited.')).toBe('Two papers were cited.');
  });
  it('leaves ordinary parentheses and citations alone', () => {
    expect(stripClaimHandles('The award (2023) is national; see 8 C.F.R. 214.2(o)(3).')).toBe('The award (2023) is national; see 8 C.F.R. 214.2(o)(3).');
  });
});

describe('tidyExcerpt', () => {
  it('drops a leading word fragment and marks the cut', () => {
    expect(tidyExcerpt('oner may submit evidence of a major award.')).toBe('…may submit evidence of a major award.');
  });
  it('drops a footnote number and stray quote but keeps whole sentences intact', () => {
    expect(tidyExcerpt('8 Here, the letters point to the work.')).toBe('Here, the letters point to the work.');
    expect(tidyExcerpt('" The Petitioner provided documentation.')).toBe('The Petitioner provided documentation.');
    expect(tidyExcerpt('The record is insufficient.')).toBe('The record is insufficient.');
  });
  it('strips "e.g." claim handles too', () => {
    expect(stripClaimHandles('Expert letters (e.g., C23) praise the work.')).toBe('Expert letters praise the work.');
  });
});
