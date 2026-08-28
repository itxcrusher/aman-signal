#!/usr/bin/env python3
"""
Fetch Urdu (Pakistan) speech samples with ground-truth transcriptions from Google FLEURS
(ur_pk test split, CC-BY-4.0) via the Hugging Face datasets-server API.

Writes WAV clips plus a gt.json ({filename: {"transcription": ...}}) into an output
directory. Audio stays untracked (the repo gitignores *.wav); this script is the
reproducible path to the evaluation data.

USAGE
    python tools/fetch_fleurs.py eval-data/           # default: 8 clips
    python tools/fetch_fleurs.py eval-data/ --count 5 --offset 20
"""
import argparse
import json
import os
import sys
import urllib.request

API = ("https://datasets-server.huggingface.co/rows"
       "?dataset=google%2Ffleurs&config=ur_pk&split=test&offset={offset}&length={length}")


def http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "amansignal-eval/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def http_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "amansignal-eval/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def audio_url(cell):
    """The audio cell is a list of {src, type} variants; prefer wav."""
    if isinstance(cell, list):
        for v in cell:
            if isinstance(v, dict) and str(v.get("type", "")).endswith(("wav", "x-wav")):
                return v.get("src")
        for v in cell:
            if isinstance(v, dict) and v.get("src"):
                return v.get("src")
    if isinstance(cell, dict):
        return cell.get("src")
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out_dir")
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--offset", type=int, default=0)
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    data = http_json(API.format(offset=args.offset, length=args.count))
    rows = data.get("rows", [])
    if not rows:
        sys.exit("datasets-server returned no rows; check connectivity or the dataset path")

    gt = {}
    for i, item in enumerate(rows):
        row = item.get("row", {})
        url = audio_url(row.get("audio"))
        text = row.get("transcription") or row.get("raw_transcription")
        if not url or not text:
            print("skip row %d (no audio url or transcription)" % i)
            continue
        name = "fleurs_ur_%03d.wav" % (args.offset + i)
        path = os.path.join(args.out_dir, name)
        if not os.path.exists(path):
            print("fetching", name, "...")
            blob = http_bytes(url)
            with open(path, "wb") as fh:
                fh.write(blob)
        gt[name] = {"transcription": text}

    gt_path = os.path.join(args.out_dir, "gt.json")
    with open(gt_path, "w", encoding="utf-8") as fh:
        json.dump(gt, fh, ensure_ascii=False, indent=1)
    print("wrote %d clips + %s" % (len(gt), gt_path))
    print("Attribution: Google FLEURS (CC-BY-4.0), config ur_pk, test split.")


if __name__ == "__main__":
    main()
