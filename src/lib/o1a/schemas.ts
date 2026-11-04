import { z } from 'zod';
import { CRITERION_KEYS, REASON_CODE_KEYS } from './criteria';

/**
 * Structured-output contracts for every model call. Models never write free
 * text into the database; everything goes through one of these schemas and is
 * then validated again in code (quotes verified, ids checked against the run).
 */

export const criterionKey = z.enum(CRITERION_KEYS);
export const strength = z.enum(['strong', 'moderate', 'weak', 'none']);
export const severity = z.enum(['high', 'medium', 'low']);
export const reasonCode = z.enum(REASON_CODE_KEYS);

// 1. Evidence Analyst: claims extracted from one exhibit. Too-short quotes are
//    dropped in code (MIN_QUOTE_CHARS) rather than rejecting the whole answer.
export const MIN_QUOTE_CHARS = 8;
export const ExtractedClaims = z.object({
  docType: z
    .enum(['cv', 'press', 'publication', 'award', 'membership', 'judging', 'letter', 'employment', 'compensation', 'advisory_opinion', 'contract', 'itinerary', 'other'])
    .describe('What kind of document this exhibit is'),
  claims: z
    .array(
      z.object({
        page: z.number().int().min(1).describe('1-based page number where the quote appears'),
        quote: z.string().describe('VERBATIM span copied character-for-character from that page; 1-3 sentences; no ellipses'),
        statement: z.string().describe('The factual claim the quote establishes, in one neutral sentence'),
      }),
    )
    .max(25),
});
export type ExtractedClaims = z.infer<typeof ExtractedClaims>;

// 2. Criteria Mapper: 8 criteria assessed against the verified claims
export const CriteriaMap = z.object({
  assessments: z
    .array(
      z.object({
        criterion: criterionKey,
        strength: strength.describe('strong = clearly satisfies every regulatory element; moderate = likely satisfies with minor gaps; weak = some evidence but a required element is missing; none = no relevant evidence'),
        claimIds: z.array(z.string()).describe('IDs of the claims relied on; empty if none'),
        rationale: z.string().describe('2-4 sentences tied to the regulatory elements. Name the missing element when not strong.'),
        comparableEvidence: z.boolean().describe('True if relying on comparable evidence under 8 CFR 214.2(o)(3)(iii)(C)'),
      }),
    )
    .length(8),
});
export type CriteriaMap = z.infer<typeof CriteriaMap>;

// 3. Gap analysis + client follow-up questions
export const GapReport = z.object({
  requirements: z.array(
    z.object({
      key: z.enum(['advisory_opinion', 'contract_itinerary', 'petitioner_relationship']),
      present: z.boolean(),
      claimIds: z.array(z.string()),
      note: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      kind: z.enum(['criterion', 'requirement', 'final_merits']),
      criterion: criterionKey.nullable(),
      title: z.string(),
      detail: z.string(),
      severity,
    }),
  ),
  questions: z
    .array(
      z.object({
        criterion: criterionKey.nullable(),
        question: z.string().describe('A specific question to the applicant, answerable with a document. Plain English, no legal jargon.'),
        rationale: z.string().describe('Why this matters for the petition (shown to the attorney, not the client)'),
      }),
    )
    .max(12),
});
export type GapReport = z.infer<typeof GapReport>;

// 4. Drafter: the model cites claim IDs only. Quotes are attached in code from
//    verified claims, so the model cannot invent a citation.
export const DraftSection = z.object({
  paragraphs: z
    .array(
      z.object({
        sentences: z
          .array(
            z.object({
              text: z.string(),
              claimIds: z.array(z.string()).describe('Claim IDs that directly support this sentence. Every factual sentence needs at least one.'),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(4),
});
export type DraftSection = z.infer<typeof DraftSection>;

// 5. Officer: adversarial review, grounded in AAO decisions
export const OfficerReview = z.object({
  objections: z
    .array(
      z.object({
        prong: z.enum(['criteria', 'final_merits', 'requirement']),
        criterion: criterionKey.nullable(),
        reasonCode,
        objection: z.string().describe('The objection as an officer would phrase it in an RFE or denial'),
        severity,
        suggestedFix: z.string().describe('Concrete evidence or argument that would cure the objection'),
        precedent: z
          .array(z.string())
          .describe('Up to 3 labels of the AAO precedent excerpts that support this objection, e.g. ["P2","P5"], or decision IDs returned by search. Extra labels are ignored.'),
      }),
    )
    .max(15),
  overallRisk: z.enum(['high', 'medium', 'low']),
});
export type OfficerReview = z.infer<typeof OfficerReview>;
