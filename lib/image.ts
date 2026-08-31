"use client";

/**
 * Normalise a chosen photo to JPEG before it is uploaded.
 *
 * The model accepts a short list of formats and rejects everything else with an
 * opaque upstream error. Phones do not respect that list: iPhones shoot HEIC by
 * default, Android increasingly writes AVIF, and a photo saved from a browser can
 * be anything at all. Sending the file untouched means a large share of real
 * reporters get a failure they cannot act on.
 *
 * Converting here rather than on the server is the better trade. The browser has
 * already decoded the image to display it, so the decoder exists and costs
 * nothing extra; a server-side path would need an image library that must itself
 * support the format, and the one available in this build reports no AVIF input
 * support at all. It also fixes two things a format check never would: an eight
 * megapixel photo is resized before it crosses a congested network, and EXIF
 * orientation is baked in rather than left for something downstream to respect.
 *
 * If the browser cannot decode the file either, this fails and the caller keeps
 * the original so the server can reject it with a message a person can read.
 */

/** Wide enough for a model to read a flooded street; small enough to send. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export type NormalisedImage = {
  file: File;
  converted: boolean;
  /** Present when the browser could not decode the file at all. */
  failed?: boolean;
};

export async function normaliseImage(input: File): Promise<NormalisedImage> {
  // Already a format the model takes, and small enough to send as-is.
  const alreadyFine = /^image\/(jpeg|png|webp)$/i.test(input.type);
  if (alreadyFine && input.size <= 1_500_000) {
    return { file: input, converted: false };
  }

  try {
    const bitmap = await decode(input);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ("close" in bitmap) (bitmap as ImageBitmap).close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("encode failed");

    const name = input.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
      converted: !alreadyFine || blob.size < input.size,
    };
  } catch {
    // The browser could not decode it either. Keep the original: the server
    // rejects it with something readable, which beats a silent drop.
    return { file: input, converted: false, failed: true };
  }
}

/**
 * createImageBitmap handles EXIF orientation and is the fast path, but not every
 * browser applies orientation the same way, and older ones lack the options
 * argument entirely. The <img> fallback covers those.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to the <img> path */
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("browser cannot decode this image"));
      img.src = url;
    });
  } finally {
    // Revoked after decode: the bitmap is drawn to a canvas synchronously by the
    // caller, so the object URL is no longer needed once this resolves.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
