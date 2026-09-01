import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getReport, mediaDir, incidentsForTeam } from "@/lib/db";
import { OPS_COOKIE, FIELD_COOKIE, verifyToken } from "@/lib/ops-auth";

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
 * Two kinds of caller reach this, and they are not owed the same thing. An
 * operator holds the district and may fetch anything in it. A field crew holds
 * one credential shared by every crew, so letting a field session fetch by id
 * alone would hand any crew every recording in the district. A field caller
 * therefore has to name their team, and the incident has to actually be
 * assigned to it; the check is a query, because a request that says which team
 * it is can say it is any team.
 *
 * The unguessable id is not the protection and never was. It is what stops one
 * report's media being reachable from another's, nothing more.
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

  /**
   * Who is asking, settled before the report is looked up.
   *
   * The proxy has established that one of the two credentials is valid. What it
   * cannot decide is whether a field crew is owed this particular report, so
   * that is settled here rather than assumed from having got through the door.
   *
   * Deliberately ahead of the lookup. Answering "no such report" before asking
   * whether the caller may have it would let a crew who names no team probe
   * which ids exist, one 404 at a time. A caller who has not said who they are
   * gets the same answer whether the id is real or invented.
   */
  const opsSecret = process.env.OPS_PASSPHRASE;
  const isOperator =
    Boolean(opsSecret) &&
    (await verifyToken(req.cookies.get(OPS_COOKIE)?.value, opsSecret as string));

  let team: string | null = null;
  if (!isOperator) {
    const fieldSecret = process.env.FIELD_PASSPHRASE;
    const isField =
      Boolean(fieldSecret) &&
      (await verifyToken(req.cookies.get(FIELD_COOKIE)?.value, fieldSecret as string));
    if (!isField) {
      return NextResponse.json({ error: "sign-in required" }, { status: 401 });
    }

    team = req.nextUrl.searchParams.get("team")?.trim() || null;
    if (!team) {
      return NextResponse.json(
        { error: "team is required: a crew may only open evidence for their own incidents" },
        { status: 400 },
      );
    }
  }

  const report = getReport(id);
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (team) {
    // Not "is it assigned to any team", which would be every crew seeing
    // everything, and not the team named in the request taken on trust. A
    // report that is not theirs answers exactly as one that does not exist.
    const theirs =
      report.incident_id !== null &&
      incidentsForTeam(team).some((inc) => inc.id === report.incident_id);
    if (!theirs) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

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
