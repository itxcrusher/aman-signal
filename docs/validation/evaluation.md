# Evaluation results (2026-08-28)

Measured behaviour of the extraction and reconciliation pipeline against labelled cases in [`eval/cases.json`](../../eval/cases.json). Reproduce with `node tools/evaluate.mjs --with-dedup`; raw output in [`eval/results.json`](../../eval/results.json).

Model `qwen3.5-omni-flash`, Alibaba Cloud Model Studio, Singapore region. Cases are written in the register reporters actually use: Urdu script, code-switched Roman Urdu, incomplete sentences, colloquial locations.

## Summary

| Metric | Result |
| --- | --- |
| Cases passed | 10 / 10 |
| Field accuracy | **100%** (32 / 32 assertions) |
| Invention rate | **0%** (0 / 7 absent fields given a fabricated value) |
| Strict rate | 14.3% (1 vague echo, see below) |
| Latency p50 / p95 | **1040ms / 1953ms** |
| Deduplication sets | 2 / 3 fully automatic, 1 partially deferred to an operator |

## Invention: the number that matters

A fabricated location or head count sends a rescue team to the wrong address, so seven fields across the case set are marked as facts the report *never states*. Any value appearing there is measured.

**Zero substantive inventions.** The model did not manufacture a place name, a head count, or a casualty figure that was absent from the source.

One **vague echo** is counted separately and is reported here rather than hidden: given `pani ghar mein aa gaya hai` ("water has come into the house"), `locations_mentioned` returned `["ghar"]`. The word is present in the report, so nothing was invented, but "house" is not a location a dispatcher can act on. The product already handles this: the clarification loop treats vague values as no location and asks for a landmark, and the model itself listed "exact location address" under `missing_information`.

Reporting only the strict 14.3% would overstate the risk; reporting only the 0% would hide a real usability gap. Both are published.

## Field accuracy

All 32 assertions passed, covering: language detection across Urdu script and Roman Urdu, incident typing, head counts, vulnerable-group identification (elderly, children), resource inference, location capture, and the road-access distinction.

Road access is measured in three states because it decides which vehicle is sent:

- `blocked` ("raasta band hai, ambulance nahi aa sakti")
- `partial` ("motorcycle abhi bhi guzar sakti hai, gaari nahi aa sakti")
- `open` ("raasta ab khul gaya hai")

An earlier prompt collapsed `partial` into `blocked`. That defect was found by this suite and fixed; the distinction now measures correctly.

**One label was corrected rather than the model.** A report describing four feet of water *and* an elderly man needing medicine was labelled `flood_entrapment`; the model answered `medical_emergency`. Both readings are defensible, so the case now asserts the set rather than one opinion. Testing a preference as if it were a fact inflates a score without improving the product.

## Negative handling

Two non-emergencies (an office-hours question, and pleasant remarks about rain) were both typed `other` with no urgency indicators and no invented location or head count. The system does not force unrelated text into the incident schema.

## Deduplication

Each set runs against a clean board, so clusters cannot leak between sets.

| Set | Expected | Result |
| --- | --- | --- |
| Three reports of one flooded street | one incident | 2 of 3 linked automatically, 1 held for operator review |
| Identical wording, 13 km apart | separate incidents | correct, kept separate |
| Same street, unrelated medical emergency | separate incidents | correct, kept separate |

The two negative sets are the ones that protect people, and both pass. The lookalike pair is the important one: identical text scores 0.85 similarity, above the auto-link threshold, and is kept apart only because proximity cannot be confirmed. Merging those two would have hidden a second trapped household.

The partial result on the first set is the conservative design working as specified, not a defect: the third report described the road as passable while the others described it as blocked, which lowered similarity below the auto-link threshold. Rather than merge on a weaker match, the system held it for a human. That is a deliberate trade, and it has a real cost in operator time, which is why it is reported as a partial rather than a pass.

## Latency

p50 1040ms, p95 1953ms, max 1953ms for text reports end to end, including validation. Audio reports measure higher (6-13s, see [production-verification.md](production-verification.md)). Intake never blocks on inference; results stream in behind an asynchronous job.

## Limitations

- Ten extraction cases and three deduplication sets. Enough to catch the defects above, not enough for a confidence interval.
- Text input only. Speech accuracy is measured separately against FLEURS; these cases do not re-measure it.
- Cases are author-written rather than collected from real reporters in a flood. They imitate the register but are not field data, and field audio will be noisier and less complete.
- Single run per case; no variance estimate across repeated calls at temperature 0.1.
- Deduplication thresholds (0.82 auto-link, 0.62 review, 500m, 6h) are set from these cases and would need retuning against real report volume.
