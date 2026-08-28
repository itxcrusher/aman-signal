#!/usr/bin/env python3
"""
Word error rate for Urdu ASR output; used for every WER figure in docs/validation/.

Normalises away Arabic-script diacritics, punctuation and zero-width joiners before
comparing, since those are orthographic rather than lexical differences and would
otherwise inflate WER without reflecting a real comprehension failure.

USAGE
    python tools/wer.py ground_truth.json hypotheses.json

Both files are {"clip_name": "transcription text", ...}. ground_truth.json also accepts
{"clip_name": {"transcription": "..."}} so a dataset dump can be passed straight in.

To reproduce the benchmark: pull the Urdu-Pakistan test split of Google FLEURS
(https://huggingface.co/datasets/google/fleurs, config `ur_pk`), save a few clips plus
their reference transcriptions, run tools/test-urdu-voice.py --mode transcribe over the
audio, then feed both files here.
"""
import io
import json
import re
import sys

# Arabic-script combining diacritics + tatweel, stripped before comparison.
DIACRITICS = "".join(
    chr(c) for c in list(range(0x064B, 0x0653)) + [0x0654, 0x0670, 0x0640]
)
PUNCT = r"[۔،؟!.,:;‌‍]"


def normalise(text):
    text = "".join(ch for ch in text if ch not in DIACRITICS)
    text = re.sub(PUNCT, " ", text)
    return text.split()


def edit_distance(ref, hyp):
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1]


def load(path):
    data = json.load(io.open(path, encoding="utf-8"))
    return {
        k: (v.get("transcription") if isinstance(v, dict) else v)
        for k, v in data.items()
    }


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    truth, hyps = load(sys.argv[1]), load(sys.argv[2])

    shared = sorted(set(truth) & set(hyps))
    if not shared:
        sys.exit("No overlapping clip names between the two files.")

    total_ref = total_edits = 0
    for name in shared:
        ref, hyp = normalise(truth[name]), normalise(hyps[name])
        if not ref:
            continue
        edits = edit_distance(ref, hyp)
        total_ref += len(ref)
        total_edits += edits
        print("%s: ref=%dw hyp=%dw edits=%d WER=%.1f%%"
              % (name, len(ref), len(hyp), edits, 100 * edits / len(ref)))

    if total_ref:
        print("\nAGGREGATE WER = %.1f%%  (%d edits / %d ref words, n=%d)"
              % (100 * total_edits / total_ref, total_edits, total_ref, len(shared)))


if __name__ == "__main__":
    main()
