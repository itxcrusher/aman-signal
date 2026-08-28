# tools/

Evaluation utilities. Everything here measures model behaviour (transcription quality, extraction, latency) so the application is built on verified numbers.

| Script | What it does |
| --- | --- |
| `test-urdu-voice.py` | Runs your own Urdu / Roman Urdu voice recordings through a free public Qwen Hugging Face Space and prints what the model understood. Three modes: `extract` (full structured incident JSON, the default), `transcribe` (Urdu script), `roman` (Roman Urdu). |
| `wer.py` | Word error rate for Urdu transcription output, normalising away diacritics and punctuation. Used for every WER figure in `docs/validation/`. |

## test-urdu-voice.py

```bash
pip install gradio_client
python tools/test-urdu-voice.py path/to/recordings/ --mode extract
```

Point it at a folder of `.wav` / `.mp3` / `.m4a` / `.ogg` / `.opus` files. Results print as they arrive and are saved to `results-<mode>.json` in that folder.

No Alibaba Cloud account, API key, credits, or payment method needed. It uses the free public Space, which is GPU-queued: **expect 30 seconds to several minutes per clip**, and occasional queue timeouts (re-run, it only processes what you hand it).

Measured results: `docs/validation/`.
