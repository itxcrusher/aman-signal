#!/usr/bin/env python3
"""
Verify Urdu speech understanding against the PRODUCTION Model Studio endpoint
(OpenAI-compatible, Singapore region), and measure real latency.

Re-runs the demo-endpoint baseline (docs/validation/urdu-voice-results.md) on the
production serving path: same data family (FLEURS ur_pk), same WER normalisation.

SETUP
    Put DASHSCOPE_API_KEY=sk-... in the repo's .env (gitignored) or the environment.
    python tools/fetch_fleurs.py eval-data/          # once, to get clips + gt.json

USAGE
    python tools/verify_production.py models                  # list available omni models
    python tools/verify_production.py wer eval-data/          # transcription WER + latency
    python tools/verify_production.py extract eval-data/fleurs_ur_001.wav
                                                              # full incident extraction
Options: --model <id> (default: auto-pick an omni model), --max <n> clips.

Results are written next to the data (results-production-*.json) for docs/validation/.
"""
import argparse
import base64
import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wer import normalise, edit_distance  # same normalisation as the baseline

try:
    import requests
except ImportError:
    sys.exit("Missing dependency. Run:  pip install requests")

BASE = os.environ.get("DASHSCOPE_BASE_URL",
                      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")

TRANSCRIBE_PROMPT = ("Transcribe the speech in this audio verbatim in Urdu script. "
                     "Output only the transcription.")

EXTRACT_PROMPT = (
    "You are a disaster-report intake system for flood emergencies in Pakistan. "
    "Listen to the audio and return ONLY a JSON object, no prose, with keys: "
    "language_detected, transcript_urdu, transcript_roman_urdu, english_summary, "
    "incident_type, urgency_indicators (array), people_affected (number or null), "
    "vulnerable_people (array), road_access (open/blocked/disputed/unknown), "
    "resources_required (array), locations_mentioned (array), "
    "missing_information (array), confidence (0-1). "
    "Never invent details that are not in the audio. If something was not said, "
    "use null or an empty array and list it under missing_information."
)


def load_key():
    if os.environ.get("DASHSCOPE_API_KEY"):
        return os.environ["DASHSCOPE_API_KEY"]
    here = os.path.dirname(os.path.abspath(__file__))
    for d in (os.path.join(here, ".."), here, "."):
        p = os.path.join(d, ".env")
        if os.path.exists(p):
            for line in io.open(p, encoding="utf-8"):
                line = line.strip()
                if line.startswith("DASHSCOPE_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("DASHSCOPE_API_KEY not found in environment or .env. "
             "Create one in Model Studio (Singapore region) and put it in the repo .env.")


def list_models(key):
    r = requests.get(BASE + "/models", headers={"Authorization": "Bearer " + key}, timeout=30)
    r.raise_for_status()
    ids = [m["id"] for m in r.json().get("data", [])]
    return sorted(ids)


def pick_model(key, wanted):
    if wanted:
        return wanted
    ids = list_models(key)
    omni = [i for i in ids if "omni" in i.lower()]
    if not omni:
        sys.exit("No omni model visible to this key. Models available:\n  " + "\n  ".join(ids))
    # Prefer flash (cheap, sized for short clips), else the first omni id.
    flash = [i for i in omni if "flash" in i]
    choice = (flash or omni)[0]
    print("auto-picked model: %s  (omni models visible: %s)" % (choice, ", ".join(omni)))
    return choice


def stream_call(key, model, prompt, wav_path):
    """One streaming chat call with audio. Returns (text, wall_seconds, first_token_seconds, usage)."""
    b64 = base64.b64encode(open(wav_path, "rb").read()).decode()
    body = {
        "model": model,
        "stream": True,
        "stream_options": {"include_usage": True},
        "temperature": 0.1,
        "modalities": ["text"],
        "messages": [{
            "role": "user",
            "content": [
                {"type": "input_audio",
                 "input_audio": {"data": "data:;base64," + b64, "format": "wav"}},
                {"type": "text", "text": prompt},
            ],
        }],
    }
    t0 = time.time()
    first = None
    out = []
    usage = None
    with requests.post(BASE + "/chat/completions", json=body, timeout=600, stream=True,
                       headers={"Authorization": "Bearer " + key}) as r:
        if r.status_code != 200:
            raise RuntimeError("HTTP %d: %s" % (r.status_code, r.text[:400]))
        for raw in r.iter_lines():
            if not raw or not raw.startswith(b"data:"):
                continue
            payload = raw[5:].strip()
            if payload == b"[DONE]":
                break
            chunk = json.loads(payload)
            if chunk.get("usage"):
                usage = chunk["usage"]
            for ch in chunk.get("choices", []):
                delta = (ch.get("delta") or {}).get("content")
                if delta:
                    if first is None:
                        first = time.time() - t0
                    out.append(delta)
    return "".join(out).strip(), time.time() - t0, first, usage


def cmd_wer(key, model, data_dir, max_clips):
    gt = json.load(io.open(os.path.join(data_dir, "gt.json"), encoding="utf-8"))
    names = sorted(gt)[:max_clips]
    results = {}
    tot_ref = tot_ed = 0
    lat = []
    for name in names:
        path = os.path.join(data_dir, name)
        print("[%s]" % name, flush=True)
        try:
            hyp, wall, ttft, usage = stream_call(key, model, TRANSCRIBE_PROMPT, path)
        except Exception as e:
            print("  FAILED:", str(e)[:300], flush=True)
            results[name] = {"error": str(e)[:500]}
            continue
        ref_w, hyp_w = normalise(gt[name]["transcription"]), normalise(hyp)
        ed = edit_distance(ref_w, hyp_w)
        tot_ref += len(ref_w); tot_ed += ed; lat.append(wall)
        results[name] = {"hyp": hyp, "wer": round(100.0 * ed / max(len(ref_w), 1), 1),
                         "ref_words": len(ref_w), "edits": ed,
                         "wall_s": round(wall, 1), "ttft_s": round(ttft or 0, 1),
                         "usage": usage}
        print("  WER %.1f%%  wall %.1fs  first-token %.1fs"
              % (results[name]["wer"], wall, ttft or 0), flush=True)
    summary = None
    if tot_ref:
        lat_sorted = sorted(lat)
        summary = {
            "model": model, "endpoint": BASE, "n_clips": len(lat),
            "aggregate_wer_pct": round(100.0 * tot_ed / tot_ref, 1),
            "total_ref_words": tot_ref, "total_edits": tot_ed,
            "latency_s": {"min": round(lat_sorted[0], 1),
                          "median": round(lat_sorted[len(lat_sorted) // 2], 1),
                          "max": round(lat_sorted[-1], 1)},
            "measured_at": time.strftime("%Y-%m-%d %H:%M PKT", time.localtime()),
        }
        print("\nAGGREGATE WER %.1f%%  (%d edits / %d words, n=%d)  latency median %.1fs"
              % (summary["aggregate_wer_pct"], tot_ed, tot_ref, len(lat),
                 summary["latency_s"]["median"]))
    out = os.path.join(data_dir, "results-production-wer.json")
    json.dump({"summary": summary, "per_clip": results},
              io.open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", out)


def cmd_extract(key, model, wav_path):
    print("[extract] %s" % wav_path, flush=True)
    hyp, wall, ttft, usage = stream_call(key, model, EXTRACT_PROMPT, wav_path)
    print("  wall %.1fs  first-token %.1fs" % (wall, ttft or 0))
    print(hyp)
    # Validate it is parseable JSON with the schema's keys present.
    txt = hyp.strip()
    if txt.startswith("```"):
        txt = txt.strip("`")
        txt = txt[txt.find("{"): txt.rfind("}") + 1]
    try:
        obj = json.loads(txt)
        required = ["language_detected", "transcript_urdu", "english_summary",
                    "incident_type", "missing_information"]
        missing = [k for k in required if k not in obj]
        print("\nJSON: parseable. Missing required keys: %s" % (missing or "none"))
    except Exception as e:
        print("\nJSON: NOT parseable (%s). Server-side repair path is mandatory." % e)
    out = os.path.splitext(wav_path)[0] + ".extract-production.json"
    io.open(out, "w", encoding="utf-8").write(hyp)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["models", "wer", "extract"])
    ap.add_argument("target", nargs="?", help="data dir (wer) or wav file (extract)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--max", type=int, default=8)
    args = ap.parse_args()

    key = load_key()
    if args.cmd == "models":
        for m in list_models(key):
            print(m)
        return
    model = pick_model(key, args.model)
    if args.cmd == "wer":
        cmd_wer(key, model, args.target or "eval-data", args.max)
    else:
        if not args.target:
            sys.exit("extract needs a wav file path")
        cmd_extract(key, model, args.target)


if __name__ == "__main__":
    main()
