"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";

/**
 * Place the emergency on a street-level map, by hand.
 *
 * A phone's fix in a dense Karachi street is routinely 30 to 50 metres out, which
 * is the difference between the right roof and the wrong block. The person sending
 * the report is standing there and knows exactly where they are, so they get to
 * correct it. The corrected pin is also what reconciliation compares against, and
 * dedup is distance-sensitive, so a better pin makes the whole board more accurate.
 *
 * This is the only location control for someone who declined the permission: they
 * find their street and drop the pin themselves. It is also where the permission is
 * offered a second time, at the one moment its purpose is self-evident.
 */
export default function LocationPin({
  lat,
  lon,
  accuracy,
  onChange,
  onUseGps,
}: {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  onChange: (lat: number, lon: number) => void;
  onUseGps?: () => Promise<boolean>;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const halo = useRef<Circle | null>(null);
  const emit = useRef(onChange);
  emit.current = onChange;

  const [moved, setMoved] = useState(false);
  const [locating, setLocating] = useState(false);
  const hasFix = lat !== null && lon !== null;

  // Karachi, only as a starting view for someone with no fix at all. It is never
  // sent as a position: nothing is submitted until they actually place the pin.
  const start: [number, number] = hasFix ? [lat, lon] : [24.8607, 67.0011];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current) return;

      map.current = L.map(container.current, {
        zoomControl: true,
        attributionControl: true,
        // Street level when we know roughly where they are, district level when we
        // do not, so they can pan to their area rather than hunt across a country.
        scrollWheelZoom: true,
      }).setView(start, hasFix ? 17 : 12);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map.current);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#0d7d76;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      marker.current = L.marker(start, { draggable: true, icon, autoPan: true }).addTo(map.current);

      if (hasFix && accuracy !== null && accuracy > 0) {
        halo.current = L.circle(start, {
          radius: accuracy,
          color: "#0d7d76",
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(map.current);
      }

      const settle = (p: { lat: number; lng: number }) => {
        setMoved(true);
        // Once the pin is placed by hand, the GPS accuracy halo describes a fix
        // that no longer applies, so it stops being drawn.
        if (halo.current) {
          halo.current.remove();
          halo.current = null;
        }
        emit.current(p.lat, p.lng);
      };

      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        settle(p);
      });

      // Tapping is easier than dragging on a phone held in one wet hand.
      map.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.current!.setLatLng(e.latlng);
        settle(e.latlng);
      });
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      halo.current = null;
    };
    // Built once. Later coordinate changes are pushed through the effect below so
    // that rebuilding the map never throws away a pin the person already placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fix arriving later (they granted the permission from the button below) moves
  // the pin, unless they have already positioned it themselves. Their placement
  // always wins over the device's guess.
  useEffect(() => {
    if (moved || !hasFix || !map.current || !marker.current) return;
    marker.current.setLatLng([lat, lon]);
    map.current.setView([lat, lon], 17);
  }, [lat, lon, hasFix, moved]);

  async function grantLocation() {
    if (!onUseGps) return;
    setLocating(true);
    await onUseGps();
    setLocating(false);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="urdu-ui text-base font-semibold">جگہ کی تصدیق کریں</h3>
          <p className="en text-sm text-ink-soft">
            {hasFix
              ? "Drag the pin to your exact spot. The phone's location is often off by half a street."
              : "Tap the map to place your exact location."}
          </p>
        </div>
      </div>

      <div
        dir="ltr"
        ref={container}
        className="mt-3 h-64 w-full overflow-hidden rounded-2xl ring-1 ring-day-line"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="en text-xs text-ink-soft">
          {moved ? (
            <span className="font-medium text-ok">Pin placed by you</span>
          ) : hasFix ? (
            <>
              From your phone
              {accuracy !== null ? `, accurate to about ${Math.round(accuracy)}m` : ""}
            </>
          ) : (
            <span className="font-medium text-critical">No location set yet</span>
          )}
        </p>

        {/* The second ask, made where the reason for it is obvious. Someone who
            skipped the permission at setup is not asked again in the abstract, but
            at the moment they are trying to say where they are. */}
        {!hasFix && onUseGps ? (
          <button
            type="button"
            onClick={grantLocation}
            disabled={locating}
            className="rounded-xl bg-brand/10 px-3 py-2 text-sm font-medium text-brand ring-1 ring-brand disabled:opacity-60"
          >
            {locating ? "Locating..." : "Use my location"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
