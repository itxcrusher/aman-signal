#!/usr/bin/env python3
"""
Evaluate Qwen's spoken Urdu / Roman Urdu understanding on your own voice notes,
via the free public demo Space (no API key needed). Results: docs/validation/.

It calls the free public Qwen Hugging Face Space. No Alibaba Cloud account, no API key,
no credits, no card. The Space is GPU-queued and can be slow (see --timeout).

USAGE
    pip install gradio_client
    python tools/test-urdu-voice.py samples/            # structured extraction (default)
    python tools/test-urdu-voice.py samples/ --mode transcribe
    python tools/test-urdu-voice.py samples/ --mode roman
    python tools/test-urdu-voice.py samples/ --space Qwen/Qwen3-Omni-Demo

Put your recordings (.wav/.mp3/.m4a/.ogg/.opus) in a folder and point at it.
Record the way a real person in an emergency would speak, not clean dictation.

Results are written to <folder>/results-<mode>.json and printed as they arrive.
"""
import argparse
import json
import os
import sys
import time

try:
    from gradio_client import Client, handle_file
except ImportError:
    sys.exit("Missing dependency. Run:  pip install gradio_client")

AUDIO_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm"}

# Default Space. Qwen3.5-Omni-Offline measured ~10% WER on Urdu and was several times
# faster than Qwen3-Omni-Demo in testing (2026-08-18). Override with --space.
DEFAULT_SPACE = "Qwen/Qwen3.5-Omni-Offline-Demo"

PROMPTS = {
    "transcribe": (
        "Transcribe the speech in this audio verbatim in Urdu script. "
        "Output only the transcription."
    ),
    "roman": (
        "Transcribe this audio into ROMAN URDU (Urdu written in Latin/English letters, "
        "the way Pakistanis type on WhatsApp). Output only the Roman Urdu transcription."
    ),
    "extract": (
        "You are a disaster-report intake system for flood emergencies in Pakistan. "
        "Listen to the audio and return ONLY a JSON object, no prose, with keys: "
        "language_detected, transcript_urdu, transcript_roman_urdu, english_summary, "
        "incident_type, urgency (low/medium/high/critical), people_affected (number or null), "
        "vulnerable_people (array: elderly/children/disabled/pregnant/injured), "
        "road_access (open/blocked/unknown), resources_required (array), "
        "locations_mentioned (array), missing_information (array of what a dispatcher "
        "would still need to ask), confidence (0-1). "
        "Never invent details that are not in the audio. If something was not said, "
        "use null or an empty array and list it under missing_information."
    ),
}


def collect(folder):
    if not os.path.isdir(folder):
        sys.exit("Not a folder: %s" % folder)
    files = sorted(
        f for f in os.listdir(folder)
        if os.path.splitext(f)[1].lower() in AUDIO_EXT
    )
    if not files:
        sys.exit(
            "No audio files in %s\nSupported: %s"
            % (folder, ", ".join(sorted(AUDIO_EXT)))
        )
    return files


def reply_text(result):
    """Pull the assistant's message out of the Gradio chat-history return value."""
    hist = result[-1] if isinstance(result, (list, tuple)) else result
    if isinstance(hist, list):
        msgs = [
            m.get("content") for m in hist
            if isinstance(m, dict) and m.get("role") == "assistant"
        ]
        if msgs:
            return msgs[-1]
    return json.dumps(hist, ensure_ascii=False)[:2000]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help="folder containing your audio recordings")
    ap.add_argument("--mode", choices=sorted(PROMPTS), default="extract",
                    help="extract (default) | transcribe | roman")
    ap.add_argument("--space", default=DEFAULT_SPACE, help="Hugging Face Space id")
    ap.add_argument("--temperature", type=float, default=0.1)
    args = ap.parse_args()

    files = collect(args.folder)
    prompt = PROMPTS[args.mode]

    print("Space   : %s" % args.space)
    print("Mode    : %s" % args.mode)
    print("Files   : %d" % len(files))
    print("Note    : the Space is GPU-queued; a clip can take 30s to several minutes.\n")

    try:
        client = Client(args.space, verbose=False)
    except Exception as exc:
        sys.exit("Could not connect to the Space (%s: %s)\n"
                 "It may be sleeping, restarting, or renamed. Open it in a browser to check."
                 % (type(exc).__name__, exc))

    results = {}
    for i, name in enumerate(files, 1):
        path = os.path.join(args.folder, name)
        started = time.time()
        print("[%d/%d] %s ..." % (i, len(files), name), flush=True)
        try:
            raw = client.predict(
                text=prompt,
                audio=handle_file(path),
                image=None,
                video=None,
                history=[],
                system_prompt="",
                temperature=args.temperature,
                top_p=0.8,
                top_k=20,
                api_name="/chat_predict",
            )
            answer = reply_text(raw)
            elapsed = round(time.time() - started)
            results[name] = {"seconds": elapsed, "output": answer}
            print("    %ss" % elapsed)
            print("    %s\n" % answer.replace("\n", "\n    "), flush=True)
        except Exception as exc:
            elapsed = round(time.time() - started)
            results[name] = {"seconds": elapsed,
                             "error": "%s: %s" % (type(exc).__name__, exc)}
            print("    FAILED after %ss -> %s: %s\n"
                  % (elapsed, type(exc).__name__, str(exc)[:300]), flush=True)

    out = os.path.join(args.folder, "results-%s.json" % args.mode)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)

    ok = sum(1 for v in results.values() if "output" in v)
    print("-" * 60)
    print("%d/%d succeeded. Saved: %s" % (ok, len(files), out))
    if ok < len(files):
        print("Failures are usually Space queue timeouts. Re-run; it only retries what you give it.")


if __name__ == "__main__":
    main()
