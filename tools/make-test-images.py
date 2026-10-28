#!/usr/bin/env python3
"""
Writes the image fixtures that verify-photo.mjs, verify-followup.mjs and
verify-field.mjs attach to reports.

USAGE
    pip install pillow
    python tools/make-test-images.py            # writes /tmp/imgtest/
    python tools/make-test-images.py some/dir/

The suites read /tmp/imgtest/ (on Windows, \\tmp\\imgtest on the drive the suite
runs from), so pass another directory only to inspect the files.

    flood.jpg, flood.png   a drawn street scene, flood water over the lower half
                           of two houses
    big.png                about 17MB of noise that will not compress, so the
                           browser has to shrink it before upload
    broken.jpg             bytes that start like a JPEG and are not one
"""
import os
import sys

from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/imgtest"
os.makedirs(out, exist_ok=True)

img = Image.new("RGB", (1200, 800), (170, 195, 215))
d = ImageDraw.Draw(img)
for x0, col in ((120, (190, 160, 120)), (650, (200, 185, 150))):
    d.rectangle([x0, 250, x0 + 420, 700], fill=col, outline=(80, 60, 40), width=4)
    d.polygon([(x0 - 20, 250), (x0 + 210, 120), (x0 + 440, 250)], fill=(140, 60, 50))
    d.rectangle([x0 + 60, 330, x0 + 160, 430], fill=(60, 80, 110))
    d.rectangle([x0 + 260, 330, x0 + 360, 430], fill=(60, 80, 110))
d.rectangle([0, 470, 1200, 800], fill=(120, 95, 60))
for y in range(490, 800, 30):
    d.line([(0, y), (1200, y + 6)], fill=(140, 115, 80), width=3)
img.save(os.path.join(out, "flood.jpg"), quality=88)
img.save(os.path.join(out, "flood.png"))

big = Image.frombytes("RGB", (2400, 2390), os.urandom(2400 * 2390 * 3))
big.save(os.path.join(out, "big.png"), compress_level=1)

with open(os.path.join(out, "broken.jpg"), "wb") as f:
    f.write(b"\xff\xd8\xff\xe0" + os.urandom(40000))

for name in ("flood.jpg", "flood.png", "big.png", "broken.jpg"):
    print(f"{os.path.join(out, name)}  {os.path.getsize(os.path.join(out, name))} bytes")
