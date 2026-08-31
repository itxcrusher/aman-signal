"use client";

/**
 * Reports composed with no usable network, held until there is one.
 *
 * This is the case the product exists for and did not handle. A flood takes the
 * network with it; someone records a voice note, presses send, and the request
 * fails. Until now that lost the report and told them to try again, which is the
 * worst possible moment to ask someone to retype what they just said.
 *
 * IndexedDB rather than localStorage, because a queued report carries a voice
 * note and a photo. localStorage holds strings, caps out around 5MB, and would
 * mean base64-encoding blobs at a 33% size penalty to store them somewhere too
 * small. IndexedDB stores Blobs natively and survives the tab closing, which
 * matters: a phone at 4% battery does not stay on the page.
 *
 * Sending is deliberately at-most-once. An entry is deleted only after the
 * server has acknowledged it, so a failure mid-flight leaves it queued and it is
 * retried; the cost of that is a possible duplicate, which the deduplication
 * layer exists to absorb, against the cost of a silently dropped emergency.
 */

/**
 * How long one page's claim on an entry is honoured. Long enough to cover an
 * upload in progress, short enough that a page killed mid-send does not stall
 * its own report. It can be short because it is no longer what prevents a
 * duplicate: the client key does that, and this only avoids spending a second
 * upload of the same audio on a connection that has already shown it cannot
 * spare one.
 */
const SEND_LEASE_MS = 20_000;

const DB_NAME = "amansignal";
const STORE = "outbox";
const VERSION = 1;

export type QueuedReport = {
  id: string;
  createdAt: number;
  text: string | null;
  audio: Blob | null;
  image: Blob | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  locationText: string | null;
  reporterId: string;
  reporterName: string;
  reporterPhone: string;
  /** Attempts made, so a permanently bad entry can be seen rather than looping. */
  tries: number;
  /**
   * When a send of this entry started, if one is believed to be running.
   *
   * The in-page lock cannot help here: reloading the page while a send is in
   * flight gives the new page a fresh module with an empty lock and an entry
   * that does not yet know its server id, so it uploads the report a second
   * time. Someone refreshing a screen that looks stuck does exactly this. The
   * claim has to outlive the page, so it lives in the store the entry lives in.
   *
   * A lease rather than a flag, because a page that dies mid-upload would
   * otherwise wedge its own report in the outbox forever. Expiring early is
   * safe: the send carries a client key, so a repeat of it is recognised as the
   * same report rather than becoming a second one.
   */
  sendingSince: number | null;
  /**
   * The id the server gave this report, once it has one.
   *
   * Sending is two calls: the upload, then the confirmation that turns a draft
   * into a report an operator can see. Holding the id between them means a
   * failure in the second is resumed rather than restarted, so a flaky link does
   * not re-upload a voice note it already delivered, and does not leave the
   * first attempt behind as an orphaned draft.
   */
  serverReportId: string | null;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function enqueue(
  entry: Omit<QueuedReport, "id" | "createdAt" | "tries" | "serverReportId" | "sendingSince">,
): Promise<string> {
  const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await tx("readwrite", (s) =>
    s.put({ ...entry, id, createdAt: Date.now(), tries: 0, serverReportId: null, sendingSince: null }),
  );
  return id;
}

export async function queued(): Promise<QueuedReport[]> {
  try {
    const all = await tx<QueuedReport[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedReport[]>);
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    // A browser refusing IndexedDB (private mode, blocked storage) must not stop
    // the app rendering. It just means nothing was queued.
    return [];
  }
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

async function bumpTries(entry: QueuedReport): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...entry, tries: entry.tries + 1 }));
}

export type FlushResult = { sent: number; failed: number; remaining: number };

/**
 * Send everything queued, oldest first.
 *
 * A flushed report is submitted AND confirmed in one step, because the
 * confirmation screen needs a model call the reporter was offline for and may
 * never return to see. The spec allows an unconfirmed report provided it is
 * visibly flagged, and it is: the board shows it as never verified by the
 * reporter, so an operator weighs the extraction accordingly. An emergency in
 * front of a human unverified beats an emergency nobody sees.
 */
/**
 * The flush currently running, if any.
 *
 * Draining is triggered from two places that fire at almost the same moment: the
 * page mounting, and the browser's online event. Without this they overlap, both
 * read the same queued entry before either has recorded a server id for it, and
 * both upload it. The reporter gets two identical reports, and the loser of the
 * race is left as a draft that no operator surface lists.
 *
 * A shared promise rather than a boolean, so the second caller waits for the
 * real result instead of being told nothing was sent.
 */
let inFlight: Promise<FlushResult> | null = null;

export function flush(): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<FlushResult> {
  const items = await queued();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    // Tracked separately from `item`, because the failure path writes the entry
    // back and would otherwise restore the snapshot taken before the upload,
    // silently discarding the id that makes the retry resumable. That is how
    // this went wrong the first time: the id was saved and then immediately
    // overwritten by the retry bookkeeping.
    let current = item;

    // Left alone while another page is believed to be sending it.
    if (item.sendingSince && Date.now() - item.sendingSince < SEND_LEASE_MS) {
      failed++;
      continue;
    }

    try {
      current = { ...item, sendingSince: Date.now() };
      await tx("readwrite", (s) => s.put(current));
      const fd = new FormData();
      if (item.text) fd.set("text", item.text);
      if (item.audio) fd.set("audio", new File([item.audio], "report.webm", { type: item.audio.type }));
      if (item.image) fd.set("image", new File([item.image], "photo.jpg", { type: item.image.type }));
      if (item.lat !== null && item.lon !== null) {
        fd.set("lat", String(item.lat));
        fd.set("lon", String(item.lon));
        if (item.accuracy !== null) fd.set("accuracy", String(item.accuracy));
      }
      if (item.locationText) fd.set("location_text", item.locationText);
      fd.set("reporter_id", item.reporterId);
      if (item.reporterName) fd.set("reporter_name", item.reporterName);
      if (item.reporterPhone) fd.set("reporter_phone", item.reporterPhone);
      fd.set("queued_offline", "1");
      // The entry's own id, which does not change across retries, so the server
      // can recognise a repeat of a send whose response was lost rather than
      // treating it as a second emergency.
      fd.set("client_key", item.id);

      // Skipped entirely when a previous attempt already uploaded. Re-sending
      // would cost a second upload of the same audio on a link that has already
      // proven unreliable, and would strand the first attempt as a draft.
      let reportId = item.serverReportId;
      if (!reportId) {
        const res = await fetch("/api/report", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`report ${res.status}`);
        reportId = (await res.json()).report_id as string;
        // Written down before confirming, so a failure in the next call is
        // resumable. If this write is what fails, the retry re-uploads: a
        // duplicate, which dedup absorbs, and the cheaper of the two mistakes.
        current = { ...current, serverReportId: reportId };
        await tx("readwrite", (s) => s.put(current));
      }

      const ack = await fetch("/api/report/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, queued_offline: true }),
      });
      // Checked, because until this call succeeds the server holds a draft and
      // no operator can see it. Deleting here on a failed confirm was the one
      // path in the whole app that could lose a report outright: the phone drops
      // its only copy and the server keeps something invisible.
      if (!ack.ok) throw new Error(`confirm ${ack.status}`);

      // Deleted only once the server has acknowledged, never merely received.
      await remove(item.id);
      sent++;
    } catch {
      // The lease is released here so the next attempt is not made to wait it
      // out. It only exists to stop two pages sending at once, and a failure
      // means nothing is sending.
      await bumpTries({ ...current, sendingSince: null }).catch(() => {});
      failed++;
    }
  }

  return { sent, failed, remaining: (await queued()).length };
}

/** True when the browser believes there is a network. Optimistic by design. */
export function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
