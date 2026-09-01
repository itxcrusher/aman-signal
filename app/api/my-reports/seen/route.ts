import { NextRequest, NextResponse } from "next/server";
import { markMessagesSeen } from "@/lib/db";

export const runtime = "nodejs";

/**
 * The reporter has read what they were told.
 *
 * A separate call rather than a side effect of fetching, so that loading the
 * list to check on a report does not quietly mark a message read that nobody
 * looked at. The control room can then tell the difference between "we said it"
 * and "they saw it", which is worth knowing before deciding to also phone them.
 */
export async function POST(req: NextRequest) {
  let body: { reporter_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const reporterId = body.reporter_id?.trim();
  if (!reporterId || reporterId.length < 8) {
    return NextResponse.json({ error: "reporter_id required" }, { status: 400 });
  }

  return NextResponse.json({ marked: markMessagesSeen(reporterId) });
}
