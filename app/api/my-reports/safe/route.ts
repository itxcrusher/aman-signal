import { NextRequest, NextResponse } from "next/server";
import { setCitizenSafe } from "@/lib/db";

export const runtime = "nodejs";

/**
 * A reporter saying the danger has passed.
 *
 * Deliberately not a resolution. The incident stays open and only an operator can
 * close it, because someone can be out of the water while the family next door is
 * still on a roof, and because a single citizen closing an incident would be the
 * one place where a non-operator changes operational state. What this does give a
 * dispatcher is the most useful thing they can learn during a flood: that a team
 * can go somewhere else.
 *
 * It is reversible. People tap the wrong thing under stress, and a mistaken "I am
 * safe" that could not be undone would be far worse than one that can.
 *
 * Scoped to the reporter's own device id, so nobody can mark a stranger safe.
 */
export async function POST(req: NextRequest) {
  let body: { reporter_id?: string; report_id?: string; safe?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const reporterId = body.reporter_id?.trim();
  const reportId = body.report_id?.trim();
  if (!reporterId || reporterId.length < 8 || !reportId) {
    return NextResponse.json({ error: "reporter_id and report_id required" }, { status: 400 });
  }

  const ok = setCitizenSafe(reportId, reporterId, body.safe !== false);
  if (!ok) {
    // Either the report does not exist or it belongs to another device. Both
    // answer the same way, so this cannot be used to discover other people's ids.
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }
  return NextResponse.json({ report_id: reportId, safe: body.safe !== false });
}
