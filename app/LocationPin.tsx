"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";
import type { Strings, Lang } from "@/lib/i18n";
import { DISTRICTS } from "@/lib/districts";

/**
 * Where the emergency is, by whichever route the reporter actually has.
 *
 * Three of them, because on a real phone at least one is usually missing:
 *
 *  1. The phone's fix, when it is available and granted.
 *  2. A pin placed by hand. A fix in a dense street is routinely 30 to 50 metres
 *     out, which is the difference between the right roof and the wrong block,
 *     and the person is standing there while the handset is estimating.
 *  3. A written address. This is the one that was missing, and its absence made
 *     the screen useless to exactly the people it matters most for. Someone whose
 *     location is denied, unavailable, or served over a connection the browser
 *     will not trust got a map of a city they may be nowhere near and no way to
 *     correct it. Panning an unfamiliar map to your own street is not a thing a
 *     frightened person can do; typing "Gali 4, Masjid ke paas" is.
 *
 * The district search moves the map without a network call, using the same table
 * the operator board assigns incidents from. A geocoding service would be more
 * precise and would fail in exactly the conditions this product exists for.
 */
export default function LocationPin({
  lat,
  lon,
  accuracy,
  onChange,
  onUseGps,
  address,
  onAddressChange,
  t,
  lang,
}: {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  onChange: (lat: number, lon: number) => void;
  onUseGps?: () => Promise<boolean>;
  address: string;
  onAddressChange: (value: string) => void;
  t: Strings;
  lang: Lang;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const halo = useRef<Circle | null>(null);
  const emit = useRef(onChange);
  emit.current = onChange;

  const [moved, setMoved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const hasFix = lat !== null && lon !== null;

  // With no fix at all the opening view is the country, not a city. Dropping
  // someone into Karachi implies a location they never gave and that most
  // reporters will not be in.
  const start: [number, number] = hasFix ? [lat, lon] : [30.3753, 69.3451];

  const areaMatches = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    if (!q) return [];
    return DISTRICTS.filter(
      (d) => d.name.toLowerCase().includes(q) || d.nameUrdu.includes(areaQuery.trim()),
    ).slice(0, 6);
  }, [areaQuery]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current) return;

      map.current = L.map(container.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView(start, hasFix ? 17 : 5);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map.current);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#0b5d53;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      // No pin until there is something to pin. An unplaced report should not
      // carry a marker sitting on the middle of the country.
      if (hasFix) {
        marker.current = L.marker(start, { draggable: true, icon, autoPan: true }).addTo(map.current);
        if (accuracy !== null && accuracy > 0) {
          halo.current = L.circle(start, {
            radius: accuracy,
            color: "#0b5d53",
            weight: 1,
            fillOpacity: 0.08,
          }).addTo(map.current);
        }
        marker.current.on("dragend", () => settle(marker.current!.getLatLng()));
      }

      function settle(p: { lat: number; lng: number }) {
        setMoved(true);
        // A hand-placed pin makes the GPS accuracy halo describe a fix that no
        // longer applies, so it stops being drawn.
        if (halo.current) {
          halo.current.remove();
          halo.current = null;
        }
        emit.current(p.lat, p.lng);
      }

      // Tapping is easier than dragging on a phone held in one wet hand, and it
      // is the only way to place a pin that does not exist yet.
      map.current.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const Ll = (await import("leaflet")).default;
        if (!marker.current) {
          marker.current = Ll.marker(e.latlng, { draggable: true, icon, autoPan: true }).addTo(map.current!);
          marker.current.on("dragend", () => settle(marker.current!.getLatLng()));
        } else {
          marker.current.setLatLng(e.latlng);
        }
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
    // rebuilding the map never discards a pin the person already placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fix arriving later (they granted the permission from the button below)
  // moves the pin, unless they have already positioned it themselves. Their
  // placement always wins over the device's guess.
  useEffect(() => {
    if (moved || !hasFix || !map.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!map.current) return;
      if (!marker.current) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:28px;height:28px;border-radius:50%;background:#0b5d53;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        marker.current = L.marker([lat, lon], { draggable: true, icon, autoPan: true }).addTo(map.current);
        marker.current.on("dragend", () => {
          const p = marker.current!.getLatLng();
          setMoved(true);
          emit.current(p.lat, p.lng);
        });
      } else {
        marker.current.setLatLng([lat, lon]);
      }
      map.current.setView([lat, lon], 17);
    })();
  }, [lat, lon, hasFix, moved]);

  function jumpTo(d: (typeof DISTRICTS)[number]) {
    setAreaQuery("");
    // Street level, so they can find their own lane from here. The pin is NOT
    // placed: a district centroid is not where the emergency is, and dropping a
    // marker there would send a team to the middle of the wrong town.
    map.current?.setView([d.lat, d.lon], 13);
  }

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
          <h3 className={`${t.face} text-base font-semibold`}>{t.confirmPlace}</h3>
          <p className={`${t.face} text-sm text-ink-soft`}>{hasFix ? t.dragPin : t.tapMap}</p>
        </div>
      </div>

      {/* Finding your own area on a map of the whole country is the hard part.
          Offered only when there is no fix, since a located reporter is already
          looking at their own street. */}
      {!hasFix ? (
        <div className="mt-3">
          <label htmlFor="area" className={`${t.face} block text-sm font-medium`}>
            {t.findYourArea}
          </label>
          <input
            id="area"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            dir="auto"
            placeholder={t.areaPlaceholder}
            className="mt-1 w-full rounded-xl border border-day-line bg-day px-4 py-3 text-base outline-none focus:border-brand"
          />
          {areaQuery.trim() ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {areaMatches.length === 0 ? (
                <p className={`${t.face} text-sm text-ink-soft`}>{t.noAreaMatch}</p>
              ) : (
                areaMatches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => jumpTo(d)}
                    className={`${t.face} rounded-xl bg-brand/10 px-3 py-2 text-sm font-medium text-brand ring-1 ring-brand`}
                  >
                    {lang === "ur" ? d.nameUrdu : d.name}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        dir="ltr"
        ref={container}
        className="mt-3 h-64 w-full overflow-hidden rounded-2xl ring-1 ring-day-line"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`${t.face} text-xs text-ink-soft`}>
          {/* A written address IS a location. Reporting "no location set" over
              the top of one someone just typed tells them they failed when they
              did not, and is the kind of small dishonesty that makes people stop
              trusting the rest of the screen. */}
          {moved ? (
            <span className="font-medium text-ok">{t.pinPlaced}</span>
          ) : hasFix ? (
            t.fromPhone(accuracy !== null ? Math.round(accuracy) : null)
          ) : address.trim() ? (
            <span className="font-medium text-ok">{t.addressOnly}</span>
          ) : (
            <span className="font-medium text-critical">{t.noLocationYet}</span>
          )}
        </p>

        {/* The second ask, made where the reason for it is obvious. Someone who
            skipped the permission at setup is not asked again in the abstract,
            but at the moment they are trying to say where they are. */}
        {!hasFix && onUseGps ? (
          <button
            type="button"
            onClick={grantLocation}
            disabled={locating}
            className={`${t.face} rounded-xl bg-brand/10 px-3 py-2 text-sm font-medium text-brand ring-1 ring-brand disabled:opacity-60`}
          >
            {locating ? t.locating : t.useMyLocation}
          </button>
        ) : null}
      </div>

      {/* Always offered, never only as a fallback. A written address carries
          things no coordinate does: which gate, which floor, whose house. It is
          the only location a reporter has when the browser refuses the rest. */}
      <div className="mt-4 border-t border-day-line pt-4">
        <label htmlFor="address" className={`${t.face} block text-base font-semibold`}>
          {t.addressLabel}
        </label>
        <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.addressHint}</p>
        <textarea
          id="address"
          value={address}
          onChange={(e) => onAddressChange(e.target.value.slice(0, 500))}
          dir="auto"
          rows={2}
          className="mt-2 w-full rounded-xl border border-day-line bg-day p-4 text-base outline-none focus:border-brand"
        />
        {address.trim() ? (
          <p className={`${t.face} mt-1 text-sm text-ok`}>{t.addressSaved}</p>
        ) : null}
      </div>
    </div>
  );
}
