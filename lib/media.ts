import fs from "node:fs";
import path from "node:path";
import { mediaDir, id } from "./db";

/**
 * Write an uploaded voice note or photo to disk.
 *
 * Extracted so intake and follow-ups handle attachments identically. They did
 * not before: follow-ups accepted text only, so a reporter whose situation had
 * changed could describe it but not record it or show it, which is the wrong way
 * round for someone standing in water.
 *
 * The extension is chosen from the declared MIME type rather than the filename,
 * because a filename is attacker-controlled and a phone's name for a photo means
 * nothing. Nothing here trusts the extension either: it only decides how the
 * file is later served, and the model rejects anything it cannot decode.
 */

export const MAX_BYTES = 12 * 1024 * 1024;

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
};

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function saveUpload(
  file: File | null,
  kind: "audio" | "image",
): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_BYTES) {
    throw new Error(`${kind} exceeds ${MAX_BYTES / 1024 / 1024}MB`);
  }
  const table = kind === "audio" ? AUDIO_EXT : IMAGE_EXT;
  const ext = table[file.type] ?? (kind === "audio" ? "webm" : "jpg");
  const dest = path.join(mediaDir(), `${id()}.${ext}`);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  return dest;
}
