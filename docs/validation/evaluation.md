# Evaluation results (2026-08-28)

Measured behaviour of the extraction and reconciliation pipeline against labelled cases in [`eval/cases.json`](../../eval/cases.json). Reproduce with `node tools/evaluate.mjs --with-dedup`; raw output in [`eval/results.json`](../../eval/results.json).

Model `qwen3.5-omni-flash`, Alibaba Cloud Model Studio, Singapore region. Cases are written in the register reporters actually use: Urdu script, code-switched Roman Urdu, incomplete sentences, colloquial locations.

## Summary

| Metric | Result |
| --- | --- |
| Cases passed | 10 / 10 |
| Field accuracy | **100%** (32 / 32 assertions) |
| Invention rate | **0%** (0 / 7 absent fields given a fabricated value) |
| Strict rate | **0%** (no vague echoes either, after the photo-grounding rules) |
| Latency p50 / p95 | **1066ms / 1770ms** |
| Deduplication sets | 2 / 3 fully automatic, 1 partially deferred to an operator |

## Invention: the number that matters

A fabricated location or head count sends a rescue team to the wrong address, so seven fields across the case set are marked as facts the report *never states*. Any value appearing there is measured.

**Zero substantive inventions.** The model did not manufacture a place name, a head count, or a casualty figure that was absent from the source.

An earlier run also recorded one **vague echo**, counted separately: given `pani ghar mein aa gaya hai` ("water has come into the house"), `locations_mentioned` returned `["ghar"]`. Nothing was invented, since the word is in the report, but "house" is not a location a dispatcher can act on. That echo disappeared when the photo-grounding rules below were added, which tightened grounding for text as well. Both numbers are still reported separately, because reporting only a strict rate overstates the risk and reporting only the substantive one would hide this class of gap if it returns.

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

## Photo analysis

Two controlled scenes were used rather than a real flood photograph, so what follows tests behaviour rather than recognition accuracy on field imagery.

**The vision path works.** Given a flooded-street scene and no text at all, the model returned `blocked_access` with `road_access: blocked` and requested a rescue boat.

**It does not invent an emergency from an unrelated photo.** A dry indoor scene submitted with a medical report ("meri ammi ki tabiyat kharab hai") returned `medical_emergency`, `road_access: unknown`, and no flood indicators of any kind.

**One overreach was found and fixed.** On the first run, the flood scene alone produced `trapped_people` and the summary "people are trapped", from an image containing no people at all. Inferring humans from pixels that do not show them is exactly the failure that sends a boat to an empty street. The prompt now states that a photo may only be reported for what is visible in it, that people must not be inferred from an empty scene, and that a head count never comes from a picture. After the fix the same image returns `blocked_access` alone and moves "whether there are any people stranded" into `missing_information`.

A photo accompanied by a report that *does* state people are on rooftops still returns `trapped_people`, because that fact is grounded in the reporter's words rather than the image.

## Urdu speech output

The confirmation summary can be read aloud, so a reporter who does not read comfortably can still check that the system understood them before it reaches a dispatcher. Text always remains on screen; audio is an addition.

That the model speaks Urdu was verified by round trip rather than taken from documentation: an Urdu sentence was spoken, the generated audio transcribed back, and the result matched the original 18 words out of 18.

Two failure modes were measured, and both produce perfectly valid audio that says the wrong thing. Given a machine-assembled sentence containing a Latin digit, the model spoke a refusal aloud in Urdu ("I cannot read this sentence because the words and symbols in it are wrong or distorted"), which to a citizen reads as their own report being rejected. Separately, repeated attempts on one sentence returned 3.3s, 3.4s and 13.9s of audio, where the short clips transcribe to nonsense while the streamed `content` field still reported the correct sentence, because that field carries what the model intended to say rather than what the audio contains.

Both were traced to prompt structure rather than the model. Wrapping the sentence inside an instruction made it treat the text as something to evaluate; sending it as a plain user message with the speaking role in a system prompt measured **6 usable clips out of 6** end to end. Numbers are also spelled out in Urdu rather than written as Latin digits, which is what triggered the refusal.

The guards remain in place regardless: the spoken text is compared against the request, and the audio must be long enough to plausibly contain the sentence. A failed check returns an error instead of audio and the citizen simply reads the summary, because the alternative is playing something confidently wrong to someone in an emergency.

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
- Text input only in the case set. Speech accuracy is measured separately against FLEURS, and photo behaviour is tested against controlled scenes rather than field photographs, so image recognition accuracy on real flood imagery is unmeasured.
- Cases are author-written rather than collected from real reporters in a flood. They imitate the register but are not field data, and field audio will be noisier and less complete.
- Single run per case; no variance estimate across repeated calls at temperature 0.1.
- Deduplication thresholds (0.82 auto-link, 0.62 review, 500m, 6h) are set from these cases and would need retuning against real report volume.
