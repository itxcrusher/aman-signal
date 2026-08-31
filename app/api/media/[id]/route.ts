import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getReport, mediaDir } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Serve the audio or photo attached to a report.
 *
 * Both were stored from the first version and never served, so an operator
 * deciding whether to send a boat could see that a voice note existed and could
 * not listen to it. The transcript is a 12% word error rate away from what was
 * said; the recording is what was said, and for a judgement this consequential
 * the operator should be able to hear it.
 *
 * Access is by report id, which is random and unguessable, and the file is read
 * by looking the report up rather than by joining the id to a path. That matters:
 * serving `mediaDir()/<user input>` is a directory traversal waiting to happen,
 * whereas a database lookup can only ever return a path this app wrote itself.
 * The resolved path is still checked to sit inside the media directory, because
 * one bad migration should not turn a lookup into an arbitrary file read.
 *
 * This is not authorisation. There are no accounts here, so an unguessable id is
 * the whole protection, which is adequate for evidence about an emergency the
 * reporter is actively asking to be shared and inadequate for anything else.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "audio" && kind !== "image") {
    return NextResponse.json({ error: "kind must be audio or image" }, { status: 400 });
  }

  const report = getReport(id);
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stored = kind === "audio" ? report.audio_path : report.image_path;
  if (!stored) return NextResponse.json({ error: "no such attachment" }, { status: 404 });

  // Defence in depth: the path came from our own database, but a file read is
  // not the place to assume that held.
  const resolved = path.resolve(stored);
  if (!resolved.startsWith(path.resolve(mediaDir()))) {
    console.error(`[media ${id}] stored path escapes the media directory: ${stored}`);
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const body = fs.readFileSync(resolved);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(body.length),
      // Evidence does not change once written, so it can be cached hard. Private
      // because it is somebody's emergency, not something a proxy should hold.
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": "inline",
    },
  });
}
