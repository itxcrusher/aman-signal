# AmanSignal

**Urdu-first incident intelligence for disaster response.** Every voice becomes action.

When floods hit Pakistan, the people who know what is happening are the people it is happening to. They report it in Urdu and Roman Urdu, by voice note, from cheap phones, in bad conditions. Relief teams receive that as scattered, duplicated, unstructured fragments, with no way to tell what is urgent, what is already known, and what is still missing. In the 2025 floods, Alkhidmat Foundation alone ran 2,161 rescue operations with 16,421 volunteers; the binding constraint on operations at that scale is not willingness, it is usable information.

AmanSignal turns raw citizen reports into structured, deduplicated, evidence-backed incidents that a human dispatcher can act on.

## How it works

A citizen reports an emergency in Urdu, Roman Urdu or English: text or a voice note, optionally a photo and location. Text always works; voice and photo are enhancements, never requirements.

```text
citizen report (voice / text / photo / location)
      │  multimodal understanding (Qwen3.5-Omni, one call)
      ▼
structured extraction ──► schema validation ──► clarification (≤2 questions)
      │                                              │
      ▼                                              ▼
  Report (immutable evidence)  ◄──── citizen confirms the interpretation
      │  geo + time + type candidates, then semantic similarity
      ▼
  Incident (operational picture, linked to every underlying report)
      ▼
dispatcher dashboard: explainable urgency indicators, conflicts preserved,
human-only workflow  New → Verified → Assigned → Responding → Resolved
```

The design principles are strict:

- **Reports are immutable evidence; incidents are interpretation.** Every conclusion on the dashboard traces back to the report it came from.
- **Nothing is invented.** Fields absent from a report are recorded as missing, and the system asks the citizen for at most two operationally critical gaps (location first) before accepting the report.
- **Conflicts are preserved, not resolved by the machine.** Two reports disagreeing about road access surface as "road access disputed, 2 sources."
- **Duplicates are linked, never destructively merged**, and report counts are never summed into casualty totals.
- **Urgency is explained, not scored.** Dispatchers see the actual indicators (trapped people, medical need, vulnerable people, blocked access) and per-dimension data quality, not an opaque percentage.
- **The AI never dispatches.** It highlights urgency indicators and supports human prioritisation; every status transition is made by a person and audited.

## Measured, not assumed

Urdu speech understanding is the load-bearing assumption, so it was benchmarked before anything was built on it. Real human Urdu speech (Google FLEURS `ur_pk`), production Alibaba Cloud Model Studio endpoint, Singapore region:

| Model | WER (n=8, 241 words) | Median latency | Range |
| --- | --- | --- | --- |
| qwen3.5-omni-flash | 12.9% | 7.3s | 6.2-9.9s |
| qwen3.5-omni-plus | 10.4% | 10.5s | 9.4-12.9s |

The same call also extracts the full structured incident record from raw audio, including Roman Urdu transliteration, and leaves absent fields null instead of hallucinating them. Notably, model output can violate the schema in small ways (enum values as free text), which is why server-side validation is part of the pipeline, not an afterthought. Full methodology and per-clip results: [docs/validation/](docs/validation/).

Remaining error is mostly orthographic; the citizen-facing confirmation step ("We understood: two elderly people trapped, road access blocked. Is this correct?") is what makes a ~10% word error rate operationally safe.

## Stack

Qwen3.5-Omni via Alibaba Cloud Model Studio (OpenAI-compatible API) for speech, image and text understanding; text embeddings for duplicate candidates; relational store for reports, incidents and audit history; object storage for media; a mobile-first citizen PWA and a dispatcher dashboard. Model processing runs behind an asynchronous job pipeline so intake never blocks on inference. Flood response is the first scenario; the intake is adapter-shaped so the same engine can later ingest WhatsApp, SMS or hotline transcripts and extend to other disaster types.

## Reproduce the benchmarks

```bash
pip install requests
python tools/fetch_fleurs.py eval-data/            # FLEURS ur_pk clips + ground truth
# put DASHSCOPE_API_KEY=sk-... in .env (see .env.example)
python tools/verify_production.py models           # list available models
python tools/verify_production.py wer eval-data/   # WER + latency
python tools/verify_production.py extract eval-data/fleurs_ur_001.wav
```

Speech samples are from Google FLEURS (CC-BY-4.0), Urdu (Pakistan) configuration.
