# Evaluation report

_Generated 2026-11-04T13:17:44.793Z. Reproduce with `npm run eval:golden && npm run eval:faithfulness && npm run eval:reliability && npm run eval:report`._

## 1. Objection recall on real AAO dismissals

Golden set: **31 published AAO O-1A appeal dismissals (2023-2026)** from the USCIS non-precedent decision library, with **100 dispositive grounds**. The officer agent sees only a neutral summary of the record (outcome language is stripped and checked by a leakage filter), and its AAO retrieval excludes the decision under test (leave-one-out). An independent judge model maps each gold ground to a predicted objection.

| Metric | Value |
|---|---|
| Recall, strict (same deficiency raised) | 55.0% (95% CI 45.2% to 64.4%) |
| Recall, lenient (same criterion/requirement flagged) | 60.0% (95% CI 50.2% to 69.1%) |
| Cases where every dispositive ground was caught | 19.4% (95% CI 9.2% to 36.3%) |
| Predictions matching an AAO ground (lower bound on precision) | 36.4% |
| 2023-2025 split, strict recall | 55.6% (95% CI 44.7% to 65.9%) |
| 2026 held-out split, strict recall | 52.6% (95% CI 31.7% to 72.7%) |
| Golden cases human-reviewed | 0 of 31 |
| Cost per case | $0.000 |
| Leak-free subset (24 cases), strict recall | 54.4% (95% CI 43.5% to 65.0%) |

Models: officer `ollama/qwen3:8b`, judge `ollama/gemma4` (different model families), both local via Ollama.

**By criterion (strict, dispositive grounds):**

| Ground | Caught / total |
|---|---|
| original_contributions | 15 / 20 |
| published_material | 8 / 12 |
| membership | 6 / 11 |
| critical_employment | 1 / 10 |
| awards | 8 / 10 |
| CRITERION_NOT_MET | 0 / 10 |
| judging | 6 / 8 |
| high_remuneration | 6 / 7 |
| final_merits | 4 / 5 |
| PROCEDURAL | 0 / 3 |
| scholarly_articles | 1 / 2 |
| advisory_opinion | 0 / 1 |
| FINAL_MERITS_NOT_MET | 0 / 1 |

Grounds labeled `CRITERION_NOT_MET` (no specific criterion) and `PROCEDURAL` cannot be predicted from the facts summary; they are kept in the denominator rather than excluded.

## 2. Citation faithfulness of drafted sentences

| Metric | Value |
|---|---|
| Sentences evaluated | 68 |
| Uncited sentences | 0 (rejected by code and by a database constraint) |
| Cited quote found on the cited page | 100.0% |
| Fully supported by cited passage (LLM judge) | 52.9% (95% CI 41.2% to 64.3%) |
| Partially supported | 11.8% |
| Unsupported | 35.3% |
| Judge vs. human agreement | pending: label evals/human/faithfulness-sample.csv, then run `npm run eval:faithfulness -- --calibrate` |

## 3. Reliability (3 independent runs per case)

| Metric | Value |
|---|---|
| Criterion strength identical to the modal rating | 93.8% |
| Met / not-met decision agreement | 97.9% |
| Fleiss' κ, strength (pooled) | 0.69 |
| "≥3 criteria" verdict identical in all runs (pass^k) | 100.0% of cases |
| Claim-set overlap between runs (mean Jaccard) | 0.46 |
| Fault injection | 2 injected failures → reached the attorney checkpoint, every step committed exactly once |

- **Mateo Alvarez**: likely-met range 0–1, verdict stable: yes, strength agreement 95.8%
- **Dr. Lena Okafor**: likely-met range 0–0, verdict stable: yes, strength agreement 91.7%

## 4. Cost and speed per case (production path)

- **Mateo Alvarez**: $0.000, 1779s compute time, 14 model calls
- **Dr. Priya Raman**: $0.000, 23677s compute time, 28 model calls
- **Dr. Lena Okafor**: $0.000, 770s compute time, 8 model calls

Mean: $0.000 and 8742s per case, set against a 48-hour preparation promise. Attorney review time is not included.

Clean timings on the reference machine (Apple M5, 16 GB RAM, all models local via Ollama, one request at a time):

- **Mateo Alvarez**: evidence mapping (ingest → claims → criteria → gaps) 16–20 min over 3 runs
- **Dr. Lena Okafor**: evidence mapping (ingest → claims → criteria → gaps) 8–9 min over 3 runs
- Full pipeline to the attorney checkpoint with 2 injected failures (Okafor): 14 min

Production-path figures above sum the latest successful duration of each step. Where a step ran while the machine was swapping heavily (Raman's extraction and mapping ran overnight with two 6-9 GB models competing for 16 GB), the figure reflects that, not the pipeline. A hosted model would cut all of these to minutes.

## Judge revisions (disclosed)

Both LLM judges were revised once after inspecting their output. Earlier results are kept in `evals/reports/*.v1-*.json`.

- **Objection matcher**: v1 accepted matches where the predicted objection targeted a different criterion, which made strict recall (69.0%) exceed lenient recall. v2 requires the matched objection to target the same criterion or prong; the judge's raw matches are cached and re-scored, with no new model calls.
- **Faithfulness judge**: v1 saw only the quoted text and rejected, for example, a CV line "Lindqvist Prize, 2025" as support for "Dr. Raman received the Lindqvist Prize" because the line does not repeat her name (v1: 30.9% supported). v2 also sees which exhibit each passage comes from and whose case it is, and is still told to reject added facts and evaluative words.
- Neither revision has yet been checked against human labels; the human-calibration sample above is the safeguard.

## Known limitations

- The golden labels were extracted by a model and verified mechanically (every ground carries a verbatim quote found in the decision); human review status is tracked per case in `evals/golden/cases/*.json`.
- AAO decisions describe the record only in summary, so the officer works from a reconstruction of the evidence, not the original exhibits.
- The AAO often stops after the first dispositive ground, so objections that do not match a gold ground are not necessarily wrong. The matched-prediction rate is a lower bound on precision.
- The drafter (an 8B local model) still adds evaluative phrases ("indicating high selectivity", "confirming its status as a major media publication") that the evidence does not state. These sentences carry citations and reach the attorney review screen, but are not yet flagged there automatically.
- Demo applicants are fictional and few (3), so reliability numbers describe this pipeline on these profiles, not a population.
