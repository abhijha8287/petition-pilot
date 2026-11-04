/**
 * O-1A evidentiary framework, 8 CFR 214.2(o)(3)(iii).
 *
 * A petition succeeds in two steps (USCIS Policy Manual Vol. 2, Part M):
 *   1. Evidence satisfies at least 3 of the 8 criteria below (or a major,
 *      internationally recognized award), and
 *   2. A final-merits determination: the totality of the evidence shows
 *      sustained national or international acclaim and that the beneficiary is
 *      among the small percentage at the very top of the field.
 *
 * Separately, the petition must carry the non-criteria requirements listed in
 * REQUIREMENTS (consultation, contracts/itinerary, petitioner relationship).
 */

export const CRITERIA = [
  {
    key: 'awards',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(1)',
    short: 'Awards',
    title: 'Nationally or internationally recognized prizes or awards for excellence',
    test: 'Prize or award is nationally or internationally recognized AND was given for excellence in the field of endeavor. Look for selection criteria, number of entrants, who grants it, and press coverage of the award itself.',
    commonFailures: 'Award is local/regional, internal to an employer, a student or early-career award, a team award without showing the beneficiary\'s role, or recognition of the award is asserted but not documented.',
  },
  {
    key: 'membership',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(2)',
    short: 'Membership',
    title: 'Membership in associations that require outstanding achievements, judged by recognized experts',
    test: 'The association requires outstanding achievement as a condition of membership AND admission is judged by recognized national or international experts. Bylaws or admission criteria must be in the record.',
    commonFailures: 'Membership is open to anyone who pays dues, based on education or years of experience, or the bylaws/admission criteria are missing.',
  },
  {
    key: 'published_material',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(3)',
    short: 'Published material',
    title: 'Published material in professional/major trade publications or major media about the beneficiary and their work',
    test: 'Material is ABOUT the beneficiary (not merely mentioning them or their employer), relates to their work in the field, appears in professional or major trade publications or other major media, and includes title, date and author.',
    commonFailures: 'Article is about the company or product rather than the person, is a press release or paid placement, lacks author/date, or the outlet\'s status as major media is undocumented (no circulation or readership data).',
  },
  {
    key: 'judging',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(4)',
    short: 'Judging',
    title: 'Participation as a judge of the work of others in the same or an allied field',
    test: 'Evidence that the beneficiary was invited to AND actually performed judging (peer review, competition panel, grant review) of others\' work in the same or allied field.',
    commonFailures: 'Only an invitation without proof the review was completed, judging of students or a different field, or informal/volunteer review without documentation.',
  },
  {
    key: 'original_contributions',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(5)',
    short: 'Original contributions',
    title: 'Original scientific, scholarly, or business-related contributions of major significance in the field',
    test: 'Contribution is original AND of major significance to the field as a whole (not just the employer or a project). Evidence of impact: adoption by others, citations well above norm, licensing, revenue, independent expert letters with specifics.',
    commonFailures: 'Letters praise the beneficiary but do not explain how the work affected the field, contribution impacts only the employer or clients, citations are modest, or the work is original but its significance is asserted rather than shown.',
  },
  {
    key: 'scholarly_articles',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(6)',
    short: 'Scholarly articles',
    title: 'Authorship of scholarly articles in professional journals or other major media',
    test: 'Beneficiary authored scholarly articles (original research, with citations, for a learned audience) in professional or major trade publications or other major media.',
    commonFailures: 'Blog posts or marketing content, articles not scholarly in nature, or the venue\'s professional status is not documented.',
  },
  {
    key: 'critical_employment',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(7)',
    short: 'Critical employment',
    title: 'Employment in a critical or essential capacity for organizations with a distinguished reputation',
    test: 'Beneficiary held a critical or essential role (not just a title) AND the organization (or division) has a distinguished reputation. Needs specifics of the beneficiary\'s impact on the organization and documentation of its reputation.',
    commonFailures: 'Role is described by title only, the organization\'s distinguished reputation is not documented, or the role is one of many similar positions.',
  },
  {
    key: 'high_remuneration',
    cfr: '8 CFR 214.2(o)(3)(iii)(B)(8)',
    short: 'High remuneration',
    title: 'Commanded a high salary or other significantly high remuneration in relation to others in the field',
    test: 'Salary or remuneration is high relative to others in the same field AND geography, shown with objective comparative wage data (e.g. BLS OEWS, industry surveys).',
    commonFailures: 'No comparative data, comparison to a different occupation or geography, equity value is speculative, or prospective salary only.',
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]['key'];
export const CRITERION_KEYS = CRITERIA.map((c) => c.key) as [CriterionKey, ...CriterionKey[]];
export const criterionByKey = Object.fromEntries(CRITERIA.map((c) => [c.key, c])) as Record<
  CriterionKey,
  (typeof CRITERIA)[number]
>;

/** Non-criteria O-1A requirements that commonly drive RFEs and denials. */
export const REQUIREMENTS = [
  {
    key: 'advisory_opinion',
    cfr: '8 CFR 214.2(o)(2)(ii)(D), (o)(5)',
    title: 'Written advisory opinion (consultation) from a peer group or labor organization',
    detail: 'A consultation from an appropriate peer group, labor and/or management organization with expertise in the field, or a "no appropriate peer group" explanation.',
  },
  {
    key: 'contract_itinerary',
    cfr: '8 CFR 214.2(o)(2)(ii)(B), (C)',
    title: 'Contract or summary of terms, and itinerary of events/activities',
    detail: 'Copies of written contracts or a summary of the oral agreement, plus an explanation of the nature of the events or activities with beginning and ending dates.',
  },
  {
    key: 'petitioner_relationship',
    cfr: '8 CFR 214.2(o)(2)(i), (o)(2)(iv)(E)',
    title: 'Qualifying U.S. employer or agent',
    detail: 'A valid U.S. employer or agent. For founders petitioning through their own company, evidence that the company can control the work (board, offer letter, governance).',
  },
] as const;

export type RequirementKey = (typeof REQUIREMENTS)[number]['key'];

/**
 * Normalized taxonomy of reasons USCIS/AAO give for O-1A denials. Used by the
 * officer agent and by the golden-set eval so predictions and labels share a
 * vocabulary.
 */
export const REASON_CODES = {
  CRITERION_NOT_MET: 'Evidence does not satisfy the regulatory elements of a specific criterion',
  NOT_ABOUT_BENEFICIARY: 'Published material is about an employer/product, not the beneficiary',
  MEDIA_STATUS_UNPROVEN: 'Outlet not shown to be major media / professional publication',
  AWARD_RECOGNITION_UNPROVEN: 'Award not shown to be nationally or internationally recognized for excellence',
  MEMBERSHIP_NOT_SELECTIVE: 'Association membership does not require outstanding achievement judged by experts',
  JUDGING_NOT_PERFORMED: 'Judging invitation without proof the review was performed, or wrong field',
  SIGNIFICANCE_NOT_SHOWN: 'Contribution\'s major significance to the field is asserted, not demonstrated',
  LETTERS_CONCLUSORY: 'Expert/recommendation letters are general, conclusory, or lack specifics',
  REPUTATION_UNPROVEN: 'Organization\'s distinguished reputation not documented',
  ROLE_NOT_CRITICAL: 'Role not shown to be critical/essential beyond job title',
  NO_COMPARATIVE_WAGE_DATA: 'Remuneration not compared to others in the field and geography',
  FINAL_MERITS_NOT_MET: 'Totality of evidence does not show sustained acclaim / top of field',
  NO_ADVISORY_OPINION: 'Missing or deficient advisory opinion / consultation',
  NO_CONTRACT_OR_ITINERARY: 'Missing contract, terms, or itinerary',
  PETITIONER_NOT_QUALIFYING: 'Petitioner/agent relationship not established',
  EVIDENCE_PREDATES_OR_POSTDATES: 'Evidence created after filing or outside the relevant period',
  NEW_EVIDENCE_ON_APPEAL: 'Evidence first submitted on appeal not considered',
  PROCEDURAL: 'Procedural defect (untimely, no specific error identified, moot, etc.)',
} as const;

export type ReasonCode = keyof typeof REASON_CODES;
export const REASON_CODE_KEYS = Object.keys(REASON_CODES) as [ReasonCode, ...ReasonCode[]];

export const STRENGTH_ORDER = { strong: 3, moderate: 2, weak: 1, none: 0 } as const;
export type Strength = keyof typeof STRENGTH_ORDER;

/** Criteria count as "likely met" when the evidence is strong or moderate. */
export function countLikelyMet(assessments: { strength: Strength }[]): number {
  return assessments.filter((a) => STRENGTH_ORDER[a.strength] >= STRENGTH_ORDER.moderate).length;
}
