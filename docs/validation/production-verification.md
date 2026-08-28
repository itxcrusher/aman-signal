# Production endpoint verification (2026-08-28)

The baseline evaluation was measured against a public demo Space. This re-runs it against the production Alibaba Cloud Model Studio endpoint (OpenAI-compatible, Singapore, `dashscope-intl.aliyuncs.com/compatible-mode/v1`), which is what AmanSignal actually ships against. Reproduce with `tools/fetch_fleurs.py` + `tools/verify_production.py`.

**Data:** Google FLEURS `ur_pk` test split (CC-BY-4.0), 8 clips, 241 reference words, real human Urdu speech. Clip `fleurs_ur_000` is byte-identical to the first clip of the baseline evaluation, tying the two runs together. WER normalisation identical to the baseline (`tools/wer.py`: diacritics and punctuation stripped).

## Transcription: WER and latency

| Model | Aggregate WER | Edits/words | Latency median | Latency range |
| --- | --- | --- | --- | --- |
| `qwen3.5-omni-flash` | **12.9%** | 31/241 | **7.3s** | 6.2-9.9s |
| `qwen3.5-omni-plus` | **10.4%** | 25/241 | 10.5s | 9.4-12.9s |

Baseline for context: 9.7% (n=3, 113 words, demo Space). The production numbers land in the same band on nearly 3x the data, so **the capability claim holds on the shipping path**. Per-clip WER ranges 0% to 21.7%; errors remain mostly orthographic-normalisation-level on inspection, consistent with the baseline.

## Latency

Free demo endpoints measured 35-730s per clip in August. Production measures **6-13s end to end**. Consequences:

- **Live inference during a demonstration is viable**, with a visible processing state. Precomputed replay is retained only as a connectivity fallback.
- The async job pipeline remains correct (spikes and outages must never block intake), but the citizen sees results in roughly 7-10 seconds, which is a usable interactive experience.
- Streaming yields no early tokens on short transcriptions (first token arrives with the full result), so UI progress states should be time-based, not token-based.

## Incident extraction on the production path

One clip through the full intake prompt (`qwen3.5-omni-flash`, 7.5s): returned parseable JSON with every required key. Null discipline held: `road_access: "unknown"`, empty arrays for absent facts, three genuinely missing items listed under `missing_information`, and no invented location or resources. Roman Urdu transliteration correct.

**One defect caught, proving the validation layer is necessary:** `urgency_indicators` came back as free text ("Children involved") rather than the schema's enum values. JSON mode guarantees JSON, not schema adherence. Server-side validation with normalisation and repair is therefore a mandatory pipeline stage, not defensive boilerplate.

## Decisions taken from this run

1. **Default model: `qwen3.5-omni-flash`** (7.3s median; 2.5pt WER premium over plus is acceptable for interactive intake, and the confirmation step covers it). `plus` remains a config-level swap where accuracy matters more than speed.
2. Demo runs live inference; replay is a connectivity fallback only.
3. Schema validation layer implements enum normalisation from day one.
