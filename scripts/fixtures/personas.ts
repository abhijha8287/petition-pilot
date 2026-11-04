/**
 * FICTIONAL applicants. Every person, organization, publication and figure in
 * this file is invented for demo purposes. Organizations are deliberately
 * fictional so no document could be mistaken for a real record.
 *
 * The three profiles are designed to exercise the pipeline:
 *  - raman:   strong case, 5+ criteria with documented elements, requirements present
 *  - alvarez: borderline; several classic weaknesses USCIS cites (press about the
 *             company, pay-to-join membership, judging invite without proof,
 *             salary without comparative data), no advisory opinion
 *  - okafor:  weak case; early-career evidence that should fail the 3-criteria test
 */

export type Doc = { label: string; slug: string; title: string; pages: string[][] };
export type Persona = {
  key: string;
  beneficiary: string;
  field: string;
  petitioner: string;
  proposedRole: string;
  clientEmail: string;
  docs: Doc[];
};

export const PERSONAS: Persona[] = [
  {
    key: 'raman',
    beneficiary: 'Dr. Priya Raman',
    field: 'Distributed systems and machine learning infrastructure',
    petitioner: 'Tessellate Labs, Inc. (Delaware)',
    proposedRole: 'Chief Technology Officer',
    clientEmail: 'priya.raman@client.exhibit-a.test',
    docs: [
      {
        label: 'A',
        slug: 'cv',
        title: 'Curriculum Vitae of Dr. Priya Raman',
        pages: [
          [
            'CURRICULUM VITAE',
            'Dr. Priya Raman',
            'Education',
            'Ph.D. in Computer Science, Northbridge Institute of Technology, 2019. Dissertation: "Consensus Under Partial Failure in Geo-Replicated Storage."',
            'B.Tech. in Computer Engineering, Coastal State University, 2014.',
            'Professional Experience',
            'Chief Technology Officer and Co-founder, Tessellate Labs, Inc., 2023 to present. Leads a team of 41 engineers building the Tessellate distributed vector database.',
            'Principal Engineer, Storage Infrastructure, Halcyon Cloud Services, 2019 to 2023. Technical lead for the Ferrous storage engine serving 2.3 trillion requests per month.',
            'Selected Honors',
            'Lindqvist Prize for Systems Research, International Society for Distributed Computing, 2025.',
            'Northbridge Institute Outstanding Dissertation Award, 2019.',
          ],
          [
            'Selected Publications',
            'Raman, P., Osei, K. "Fennel: Bounded-Staleness Reads at Planetary Scale." Proceedings of the Symposium on Operating Systems Design (SOSD), 2022. Cited 412 times.',
            'Raman, P. et al. "Quorum Leases Revisited." Journal of Distributed Computing Systems, vol. 31, 2021. Cited 268 times.',
            'Raman, P., Liu, H. "Learned Compaction Policies for LSM Trees." Proceedings of the Conference on Very Large Data Systems (VLDS), 2024. Cited 97 times.',
            'Service',
            'Program Committee member, SOSD 2024 and SOSD 2025. Reviewed 19 submissions in total.',
            'Grant reviewer, Fenwick Foundation Systems Research Fund, 2025.',
          ],
        ],
      },
      {
        label: 'B',
        slug: 'lindqvist-prize',
        title: 'Lindqvist Prize award letter and selection statistics',
        pages: [
          [
            'International Society for Distributed Computing',
            'Office of Awards',
            'March 14, 2025',
            'Dear Dr. Raman,',
            'On behalf of the Awards Committee, I am pleased to inform you that you have been selected as the 2025 recipient of the Lindqvist Prize for Systems Research. The Prize recognizes a single researcher or practitioner whose work has had exceptional impact on the design of large-scale computing systems.',
            'This year the Committee considered 214 nominations from 31 countries. The Committee, composed of nine past recipients and fellows of the Society, selected your work on bounded-staleness replication for "fundamentally changing how the industry builds geo-replicated storage."',
            'The Prize carries an honorarium of $25,000 and will be presented at the Society\'s annual congress in Lisbon.',
            'Sincerely,',
            'Prof. Annelise Brandt, Chair, Lindqvist Prize Committee',
          ],
          [
            'About the Lindqvist Prize',
            'Established in 1998, the Lindqvist Prize is awarded once a year and is regarded as one of the two most prestigious honors in distributed systems. Past recipients include the designers of several widely deployed consensus protocols.',
            'Coverage of the 2025 Prize appeared in Systems Engineering Quarterly and The Meridian Technology Review.',
            'Selection criteria: originality, demonstrated adoption outside the nominee\'s own organization, and influence on subsequent research.',
          ],
        ],
      },
      {
        label: 'C',
        slug: 'meridian-profile',
        title: 'The Meridian Technology Review profile, with circulation data',
        pages: [
          [
            'THE MERIDIAN TECHNOLOGY REVIEW',
            'June 2, 2025 | By Daniel Whitcombe, Senior Editor',
            'The Engineer Who Made Global Databases Feel Local',
            'When Priya Raman joined Halcyon Cloud Services in 2019, cross-continent database reads routinely took over 300 milliseconds. Her Fennel protocol cut that to under 40 milliseconds without giving up consistency guarantees, and it is now used by at least six major cloud providers.',
            '"Raman\'s insight was that most applications can tolerate a bounded, precisely measured amount of staleness," said Dr. Kwame Osei, a professor at Lakeshore University. "She turned that into a protocol people could actually deploy."',
            'Raman now leads engineering at Tessellate Labs, where she is applying the same ideas to vector search.',
          ],
          [
            'Publisher\'s statement of circulation and readership',
            'The Meridian Technology Review is a national technology magazine published monthly since 1971. Audited paid circulation: 1,180,000 print and digital subscribers (Audit Bureau of Media, December 2024). Monthly unique online readers: 9.4 million.',
          ],
        ],
      },
      {
        label: 'D',
        slug: 'sosd-review-confirmation',
        title: 'SOSD Program Committee service confirmation',
        pages: [
          [
            'Symposium on Operating Systems Design (SOSD)',
            'Program Committee Chairs',
            'September 30, 2025',
            'To whom it may concern:',
            'This letter confirms that Dr. Priya Raman served on the Program Committee of SOSD 2024 and SOSD 2025. In that capacity she completed full peer reviews of 19 research paper submissions (9 in 2024 and 10 in 2025) and participated in the in-person program committee meeting where final acceptance decisions were made.',
            'SOSD accepted 61 of 492 submissions in 2025 (12.4 percent). Program Committee members are invited by the chairs based on their record of publication at the venue.',
            'Signed, Prof. Mariko Tanaka and Dr. Lucas Ferreira, SOSD 2025 Program Co-Chairs',
          ],
        ],
      },
      {
        label: 'E',
        slug: 'expert-letter-osei',
        title: 'Expert opinion letter from Prof. Kwame Osei',
        pages: [
          [
            'Lakeshore University, Department of Computer Science',
            'October 6, 2025',
            'Re: O-1A petition for Dr. Priya Raman',
            'I am a Professor of Computer Science at Lakeshore University. I have no financial relationship with Tessellate Labs.',
            'Dr. Raman\'s Fennel protocol is a contribution of major significance to the field of distributed systems. Before Fennel, operators chose between strong consistency with high cross-region latency and weak consistency with unpredictable anomalies. Fennel introduced bounded-staleness reads with a formally verified upper bound, and its open-source implementation has been adopted by Halcyon Cloud, Arcadia Compute, Northwind Data and at least three other providers.',
            'The Fennel paper has been cited 412 times, which places it in the top 1 percent of systems papers published in 2022. Independent groups have built on it in at least 37 follow-up papers.',
            'Sincerely, Prof. Kwame Osei',
          ],
        ],
      },
      {
        label: 'F',
        slug: 'compensation',
        title: 'Compensation letter and comparative wage data',
        pages: [
          [
            'Tessellate Labs, Inc. - Offer of Employment (Summary of Terms)',
            'Position: Chief Technology Officer. Base salary: $310,000 per year, plus equity of 6.5 percent of fully diluted shares. Term: three years beginning January 2, 2026. Work location: San Francisco, California.',
            'The Board of Directors of Tessellate Labs, Inc. sets the CTO\'s compensation and may supervise and terminate the position.',
          ],
          [
            'Comparative wage data',
            'U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics (OEWS), May 2024, San Francisco-Oakland-Berkeley MSA, Computer and Information Research Scientists (15-1221): 90th percentile annual wage $239,000.',
            'Dr. Raman\'s base salary of $310,000 exceeds the 90th percentile for the occupation in the same metropolitan area.',
          ],
        ],
      },
      {
        label: 'G',
        slug: 'advisory-opinion',
        title: 'Advisory opinion from the Association for Systems Engineering',
        pages: [
          [
            'Association for Systems Engineering - Peer Advisory Opinion',
            'November 1, 2025',
            'The Association for Systems Engineering is a professional peer group of 48,000 practitioners and researchers in computing systems. We have reviewed the description of Dr. Priya Raman\'s proposed work as Chief Technology Officer of Tessellate Labs.',
            'In our opinion Dr. Raman is a person of extraordinary ability in distributed systems, and the proposed work requires the services of a person of extraordinary ability. We have no objection to the approval of the petition.',
            'Signed, Dr. Helena Voss, Executive Director',
          ],
        ],
      },
    ],
  },
  {
    key: 'alvarez',
    beneficiary: 'Mateo Alvarez',
    field: 'Financial technology product leadership',
    petitioner: 'Ledgerline, Inc. (Delaware)',
    proposedRole: 'Chief Executive Officer',
    clientEmail: 'mateo.alvarez@client.exhibit-a.test',
    docs: [
      {
        label: 'A',
        slug: 'cv',
        title: 'Resume of Mateo Alvarez',
        pages: [
          [
            'MATEO ALVAREZ',
            'Experience',
            'Co-founder and CEO, Ledgerline, Inc., 2022 to present. Ledgerline provides real-time reconciliation software for small businesses. 34 employees; $4.1 million annual recurring revenue.',
            'Senior Product Manager, Pagora Payments, 2018 to 2022. Led the merchant onboarding team (8 people).',
            'Education',
            'MBA, Riverside School of Management, 2018. B.S. Economics, Universidad del Pacifico Sur, 2013.',
            'Recognition',
            '"40 Founders to Watch," Fintech Weekly Digest, 2024.',
            'Member, Global Fintech Leaders Association, since 2023.',
            'Invited judge, Startup Pitch Night at Riverside School of Management, 2024.',
          ],
        ],
      },
      {
        label: 'B',
        slug: 'press-company',
        title: 'Bayline Business Journal article on Ledgerline',
        pages: [
          [
            'BAYLINE BUSINESS JOURNAL',
            'August 19, 2024',
            'Ledgerline Raises $9 Million Series A to Automate Small-Business Bookkeeping',
            'Ledgerline, a San Francisco startup, announced a $9 million Series A led by Northgate Ventures. The company says its software reconciles bank and card transactions in real time for more than 2,000 small businesses.',
            'The round will fund hiring in engineering and sales, according to a company press release. Ledgerline was co-founded in 2022 by Mateo Alvarez and Sara Lindgren.',
          ],
        ],
      },
      {
        label: 'C',
        slug: 'fintech-weekly-list',
        title: 'Fintech Weekly Digest "40 Founders to Watch" listing',
        pages: [
          [
            'Fintech Weekly Digest - 40 Founders to Watch (2024)',
            'Number 27: Mateo Alvarez, Ledgerline. Alvarez is building reconciliation tools for small businesses. Before Ledgerline he worked on merchant onboarding at Pagora Payments.',
            'Fintech Weekly Digest is an email newsletter. Nominations for this list were open to the public via an online form.',
          ],
        ],
      },
      {
        label: 'D',
        slug: 'membership',
        title: 'Global Fintech Leaders Association membership certificate',
        pages: [
          [
            'Global Fintech Leaders Association',
            'Certificate of Membership',
            'This certifies that Mateo Alvarez is a Professional Member in good standing for the 2025 membership year.',
            'Professional Membership is available to any professional working in financial technology upon payment of the annual dues of $450.',
          ],
        ],
      },
      {
        label: 'E',
        slug: 'judging-invite',
        title: 'Startup Pitch Night judging invitation',
        pages: [
          [
            'Riverside School of Management Entrepreneurship Club',
            'February 2, 2024',
            'Hi Mateo, we would love for you to join the judging panel for our student Startup Pitch Night on March 8. Judges will hear six five-minute pitches from current MBA students and pick a winner. Let us know if you can make it!',
          ],
        ],
      },
      {
        label: 'F',
        slug: 'cto-letter',
        title: 'Letter from Ledgerline co-founder Sara Lindgren',
        pages: [
          [
            'Ledgerline, Inc.',
            'October 12, 2025',
            'I am the co-founder and CTO of Ledgerline. Mateo is an extraordinary leader and one of the most talented product thinkers in fintech. He set our product strategy, raised our Series A and built our sales team. Without him Ledgerline would not exist.',
            'Signed, Sara Lindgren',
          ],
        ],
      },
      {
        label: 'G',
        slug: 'salary',
        title: 'Ledgerline compensation letter',
        pages: [
          [
            'Ledgerline, Inc.',
            'This letter confirms that Mateo Alvarez is employed as Chief Executive Officer with an annual base salary of $185,000.',
          ],
        ],
      },
    ],
  },
  {
    key: 'okafor',
    beneficiary: 'Dr. Lena Okafor',
    field: 'Computational biology',
    petitioner: 'Corvid Therapeutics, Inc.',
    proposedRole: 'Research Scientist',
    clientEmail: 'lena.okafor@client.exhibit-a.test',
    docs: [
      {
        label: 'A',
        slug: 'cv',
        title: 'Curriculum Vitae of Dr. Lena Okafor',
        pages: [
          [
            'Dr. Lena Okafor',
            'Ph.D., Computational Biology, Westmere University, 2024.',
            'Postdoctoral Researcher, Westmere University, 2024 to present.',
            'Publications',
            'Okafor, L., Brandt, M. "Graph Embeddings for Protein Interaction Prediction." Westmere Bioinformatics Workshop, 2023. Cited 6 times.',
            'Okafor, L. "A Benchmark for Single-Cell Clustering." bioRxiv preprint, 2024. Cited 3 times.',
            'Honors',
            'Best Poster Award, Westmere Graduate Research Day, 2023.',
          ],
        ],
      },
      {
        label: 'B',
        slug: 'poster-award',
        title: 'Westmere Graduate Research Day poster award',
        pages: [
          [
            'Westmere University Graduate School',
            'Congratulations to Lena Okafor, winner of the Best Poster Award (Life Sciences track) at Graduate Research Day 2023. The award is open to current Westmere graduate students and includes a $200 book voucher.',
          ],
        ],
      },
      {
        label: 'C',
        slug: 'advisor-letter',
        title: 'Recommendation letter from Prof. Martin Brandt',
        pages: [
          [
            'Westmere University, Department of Biology',
            'I supervised Dr. Okafor\'s doctoral research. She is hard-working, creative and one of the best students I have had in recent years. Her benchmark for single-cell clustering is a useful resource and I expect it to be widely used in the future.',
            'Prof. Martin Brandt',
          ],
        ],
      },
      {
        label: 'D',
        slug: 'offer',
        title: 'Corvid Therapeutics offer letter',
        pages: [
          [
            'Corvid Therapeutics, Inc.',
            'We are pleased to offer you the position of Research Scientist at an annual salary of $128,000, starting February 1, 2026, in Boston, Massachusetts. Employment is for an initial term of two years.',
          ],
        ],
      },
    ],
  },
];
