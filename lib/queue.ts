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

export async function enqueue(entry: Omit<QueuedReport, "id" | "createdAt" | "tries">): Promise<string> {
  const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await tx("readwrite", (s) => s.put({ ...entry, id, createdAt: Date.now(), tries: 0 }));
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
export async function flush(): Promise<FlushResult> {
  const items = await queued();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
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

      const res = await fetch("/api/report", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`report ${res.status}`);
      const json = await res.json();

      await fetch("/api/report/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: json.report_id, queued_offline: true }),
      });

      // Deleted only once the server has it. A crash before this point costs a
      // duplicate, which dedup absorbs; a delete before it would cost the report.
      await remove(item.id);
      sent++;
    } catch {
      await bumpTries(item).catch(() => {});
      failed++;
    }
  }

  return { sent, failed, remaining: (await queued()).length };
}

/** True when the browser believes there is a network. Optimistic by design. */
export function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
