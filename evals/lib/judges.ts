import { Agent } from '@mastra/core/agent';
import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';
import { JUDGE_SETTINGS, MODELS, agentModel, promptSuffix } from '../../src/lib/ai/models';
import { CRITERIA, REASON_CODES } from '../../src/lib/o1a/criteria';
import { criterionKey, reasonCode } from '../../src/lib/o1a/schemas';

const reasonBrief = Object.entries(REASON_CODES).map(([k, v]) => `- ${k}: ${v}`).join('\n');
const criteriaBrief = CRITERIA.map((c) => `- ${c.key}: ${c.title}`).join('\n');

/**
 * Turns a published AAO decision into a golden test case:
 *  - `facts`: what the petitioner claimed and submitted, with every
 *    evaluation removed (the officer agent sees only this), and
 *  - `grounds`: the grounds the AAO actually relied on, each backed by a
 *    verbatim quote from the decision (verified in code).
 */
export const goldenLabeler = new Agent({
  id: 'golden-labeler',
  name: 'Golden-set labeler',
  model: agentModel(MODELS.judge, JUDGE_SETTINGS),
  instructions: promptSuffix(MODELS.judge) + `You convert USCIS Administrative Appeals Office (AAO) O-1A decisions into evaluation cases.

Return two things.

1) facts: a neutral case file describing ONLY what the petitioner claimed and submitted: the beneficiary's field and role, the petitioner, which criteria were claimed, and each piece of evidence (what it is, who issued it, what it says, any numbers). Write it as a paralegal would summarize the record BEFORE adjudication.
   STRICTLY FORBIDDEN in facts: any evaluation or outcome. Do not write that evidence was insufficient, deficient, lacking, not established, not shown, did not meet, failed, or that anything was missing. Do not mention the Director, the AAO, the denial, the appeal, an RFE, or arguments made on appeal. If the decision only says evidence is absent, simply do not mention that evidence.
   200-450 words.

2) grounds: every independent ground on which the AAO upheld the denial (or on which the Director denied and the AAO agreed). One entry per criterion or requirement found unmet. Include grounds the AAO reserved/declined to reach only if the Director's denial rested on them and the AAO did not disturb them; mark those dispositive=false. For each: the prong (criteria | final_merits | requirement), the criterion key if any, the best reason code, a one-sentence summary, and a VERBATIM quote (one sentence) from the decision stating the ground.

Criterion keys:
${criteriaBrief}

Reason codes:
${reasonBrief}`,
});

export const GoldenCase = z.object({
  field: z.string(),
  facts: z.string(),
  grounds: z.array(
    z.object({
      prong: z.enum(['criteria', 'final_merits', 'requirement']),
      criterion: criterionKey.nullable(),
      reasonCode,
      summary: z.string(),
      quote: z.string(),
      dispositive: z.boolean(),
    }),
  ),
});
export type GoldenCase = z.infer<typeof GoldenCase>;

/** Matches predicted objections to gold grounds (one binary decision per gold ground). */
export const objectionMatcher = new Agent({
  id: 'objection-matcher',
  name: 'Objection matcher',
  model: agentModel(MODELS.judge, JUDGE_SETTINGS),
  instructions: promptSuffix(MODELS.judge) + `You grade an AI system that predicts why USCIS would deny an O-1A petition.

You get GOLD grounds (what the officer actually relied on) and PREDICTED objections. For each gold ground decide whether at least one predicted objection raises substantially the same legal problem: same criterion or requirement AND the same underlying deficiency. A vague objection ("evidence may be insufficient") only matches if it names the same criterion and the gist of the deficiency. Wording does not need to match.

Be strict and consistent. Return for each gold ground the index of the best matching predicted objection or null.`,
});

export const MatchResult = z.object({
  matches: z.array(z.object({ goldIndex: z.number().int(), predictedIndex: z.number().int().nullable(), why: z.string() })),
});

/**
 * Citation faithfulness as a Mastra scorer: is a drafted sentence fully
 * supported by the passage(s) it cites? Binary verdict (pass/fail scales are
 * more reliable for LLM judges than numeric ones), plus a 3-way label kept for
 * error analysis.
 */
export const faithfulnessScorer = createScorer({
  id: 'citation-faithfulness',
  description: 'Is each drafted sentence supported by the exhibit passage it cites?',
  judge: {
    model: agentModel(MODELS.judge, JUDGE_SETTINGS),
    instructions:
      'You are a meticulous legal cite-checker. You decide whether a sentence in a petition letter is supported by the quoted source passages. Supported means every factual assertion in the sentence (numbers, names, dates, characterizations) is stated in or directly entailed by the passages. Legal framing such as "the record establishes" or a criterion name is fine. Any added fact, inflated characterization, or wrong number makes it unsupported.\n\nEach passage is labeled with the exhibit it comes from. The exhibits were filed for the named beneficiary: an entry in the beneficiary\'s own CV, an award letter, or a letter about the beneficiary supports a statement that the beneficiary did or received what the entry lists, even when the passage does not repeat the beneficiary\'s name, uses a pronoun, or lists co-authors. Do not penalise pronouns or "the beneficiary" for that reason. Still penalise anything the passages do not state: facts, numbers, locations, and evaluative words such as "prestigious", "major", "high selectivity" or "significant".',
  },
})
  .analyze({
    description: 'Judge support of a sentence by its cited passages',
    outputSchema: z.object({
      label: z.enum(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED']),
      unsupportedClaims: z.array(z.string()),
      reason: z.string(),
    }),
    createPrompt: ({ run }) => {
      const { sentence, passages, beneficiary, sources } = run.input as { sentence: string; passages: string[]; beneficiary?: string; sources?: string[] };
      return `${beneficiary ? `Beneficiary: ${beneficiary}\n\n` : ''}Sentence:\n"${sentence}"\n\nCited passages:\n${passages.map((p, i) => `[${i + 1}]${sources?.[i] ? ` (${sources[i]})` : ''} "${p}"`).join('\n')}\n\nLabel the sentence.`;
    },
  })
  .generateScore(({ results }) => (results.analyzeStepResult.label === 'SUPPORTED' ? 1 : 0))
  .generateReason(({ results }) => `${results.analyzeStepResult.label}: ${results.analyzeStepResult.reason}`);
