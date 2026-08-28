# Urdu speech understanding: baseline evaluation (2026-08-18)

Initial evaluation of Qwen multimodal models on Urdu speech transcription and structured extraction, run against public demo endpoints. Superseded for engineering decisions by the production-endpoint evaluation in [production-verification.md](production-verification.md); kept as the baseline record.

## Background

Alibaba's dedicated speech-recognition models (the Qwen3-ASR family) do not list Urdu among their supported languages. The multimodal Qwen-Omni family does. This evaluation establishes whether that documented capability holds on real Urdu speech, and whether a single multimodal call can produce the structured incident record AmanSignal requires.

## Data and method

- **Speech:** Google FLEURS `ur_pk` test split (CC-BY-4.0): real human Urdu read speech, 16 kHz, three clips (6.2s, 12.1s, 12.2s), 113 reference words total, each with an official transcription.
- **Model:** Qwen3.5-Omni via the public Hugging Face Space `Qwen/Qwen3.5-Omni-Offline-Demo` (`/chat_predict`, temperature 0.1).
- **Metric:** word error rate after stripping Arabic-script diacritics, punctuation and zero-width joiners (orthographic rather than lexical differences; implementation in `tools/wer.py`).

## Transcription results

| Clip | Ref words | Edits | WER |
| --- | --- | --- | --- |
| clip 0 | 44 | 6 | 13.6% |
| clip 1 | 20 | 2 | 10.0% |
| clip 2 | 49 | 3 | 6.1% |
| **Aggregate** | **113** | **11** | **9.7%** |

Error inspection: most edits are normalisation-level spelling variants (`لانبے` vs `لمبے`, `حوزات` vs `حوضات`); one synonym substitution (`معاصر` for `ماڈرن`) preserved meaning. No comprehension-level failures observed in this sample.

## Structured extraction

A single call from raw audio returned the full incident record: Urdu transcript, Roman Urdu transliteration, English summary, `people_affected`, `vulnerable_people`. Two behaviours relevant to the product design:

- Fields not present in the audio were returned as `unknown`/empty rather than invented, with the gaps listed under `missing_information`.
- Given a clip that did not describe a flood, the model flagged the mismatch under `missing_information` rather than force-fitting the content into the schema.

## Latency

Observed 35-730 seconds per clip across the public Spaces. These are shared, GPU-queued demo deployments; the figures characterise the demo infrastructure, not the model. Production-endpoint latency is measured in [production-verification.md](production-verification.md) (6-13s end to end).

## Limitations

- n=3 clips of read speech recorded in good conditions; field audio (noise, emotion, code-switching, phone microphones) will perform worse.
- Demo-endpoint serving path; model version and configuration not controlled.
- Single run per clip; no variance estimate.

These limitations are why the evaluation was repeated on the production endpoint with a larger sample before any component was built on the result.

## Reproducing

`tools/test-urdu-voice.py` runs recordings through the demo Space (`pip install gradio_client`). For the production-endpoint version, use `tools/verify_production.py`.
