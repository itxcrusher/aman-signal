# tools/

Evaluation utilities. Everything here measures model behaviour (transcription quality, extraction, latency) so the application is built on verified numbers.

| Script | What it does |
| --- | --- |
| `test-urdu-voice.py` | Runs your own Urdu / Roman Urdu voice recordings through a free public Qwen Hugging Face Space and prints what the model understood. Three modes: `extract` (full structured incident JSON, the default), `transcribe` (Urdu script), `roman` (Roman Urdu). |
| `wer.py` | Word error rate for Urdu transcription output, normalising away diacritics and punctuation. Used for every WER figure in `docs/validation/`. |
| `e2e.mjs` | Drives both surfaces in a real browser, including the voice path. |
| `seed-demo.mjs` | Builds the demo scenario through the live API. |
| `reset-data.mjs` | Returns the local database to a known state. |
| `screenshot.mjs` | Captures a page at a true CSS viewport and reports what rendered. |

## test-urdu-voice.py

```bash
pip install gradio_client
python tools/test-urdu-voice.py path/to/recordings/ --mode extract
```

Point it at a folder of `.wav` / `.mp3` / `.m4a` / `.ogg` / `.opus` files. Results print as they arrive and are saved to `results-<mode>.json` in that folder.

No Alibaba Cloud account, API key, credits, or payment method needed. It uses the free public Space, which is GPU-queued: **expect 30 seconds to several minutes per clip**, and occasional queue timeouts (re-run, it only processes what you hand it).

Measured results: `docs/validation/`.

## e2e.mjs

```bash
npm run dev                                       # in another terminal
node tools/e2e.mjs --audio path/to/urdu-report.wav
node tools/e2e.mjs --headed                       # watch it run
```

Voice is genuinely exercised rather than stubbed. Chromium is launched with a WAV file standing in for the microphone (`--use-file-for-fake-audio-capture`), so `MediaRecorder`, the upload, the model call and the confirmation screen all run exactly the code a citizen's phone would, and the run asserts that the audio came back transcribed into Urdu rather than merely attached.

The citizen surface is driven at a phone viewport with `ur-PK` locale and granted geolocation; the operator board at desktop. The run also checks the things that are easy to assume: that an empty report cannot be sent, that an anonymous status change is refused, and that losing the network produces a message rather than a hang.
