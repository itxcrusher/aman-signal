"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";
import type { Strings } from "@/lib/i18n";

type Candidate = { lat: number; lon: number; label: string; kind: string };

/**
 * Where the emergency is, by whichever route the reporter actually has.
 *
 * Three of them, because on a real phone at least one is missing:
 *
 *  1. The phone's fix, when available and granted. Absent on any insecure origin,
 *     which includes every phone reaching a server over plain http.
 *  2. A pin placed by hand. An urban fix is routinely 30 to 50 metres out, the
 *     difference between the right roof and the wrong block, and the reporter is
 *     standing there while the handset is estimating.
 *  3. A written address, the only one always available. It is kept verbatim and
 *     is the authoritative human-readable location.
 *
 * Which one leads depends on what exists. With a fix the map is first: the
 * reporter is looking at their own street and a dragged pin beats any sentence.
 * Without one the written address is first and the map drops to an optional
 * extra, because a map of the whole country is a puzzle rather than an input.
 *
 * The address can be looked up on the map, but a lookup NEVER sets the location
 * on its own. Measured against real Pakistani addresses before this was built,
 * which is what decided the design: "Shah Faisal Colony Karachi" resolves
 * correctly, "Gali 4 Mohalla Islampura Toba Tek Singh" returns nothing, and
 * "Mohalla Islampura" comes back as Jhelum, roughly 200km wrong, with no signal
 * that it is wrong. Candidates are therefore shown with the full name they
 * matched, the reporter reads it, and a coordinate is taken only when they pick
 * one. A boat sent 200km wrong is worse than a boat sent nowhere.
 *
 * An earlier version offered a district search to move the map. It was removed:
 * it added a third thing to learn in order to reach a fourth, when looking up the
 * address they had already typed does the same job with no extra concept.
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
}: {
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  onChange: (lat: number, lon: number) => void;
  onUseGps?: () => Promise<boolean>;
  address: string;
  onAddressChange: (value: string) => void;
  t: Strings;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const halo = useRef<Circle | null>(null);
  const emit = useRef(onChange);
  emit.current = onChange;

  const [moved, setMoved] = useState(false);
  const [fromAddress, setFromAddress] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  const hasFix = lat !== null && lon !== null;

  // With no fix the opening view is the country, not a city. Dropping someone
  // into Karachi implies a location they never gave.
  const start: [number, number] = hasFix ? [lat, lon] : [30.3753, 69.3451];

  async function leaflet() {
    return (await import("leaflet")).default;
  }

  function makeIcon(L: typeof import("leaflet")) {
    return L.divIcon({
      className: "",
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#0b5d53;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  function settle(p: { lat: number; lng: number }, viaAddress = false) {
    setMoved(true);
    setFromAddress(viaAddress);
    // A placed pin makes the GPS accuracy halo describe a fix that no longer
    // applies, so it stops being drawn.
    if (halo.current) {
      halo.current.remove();
      halo.current = null;
    }
    emit.current(p.lat, p.lng);
  }

  async function placePin(la: number, lo: number, zoom: number, viaAddress: boolean) {
    const L = await leaflet();
    if (!map.current) return;
    if (!marker.current) {
      marker.current = L.marker([la, lo], {
        draggable: true,
        icon: makeIcon(L),
        autoPan: true,
      }).addTo(map.current);
      marker.current.on("dragend", () => settle(marker.current!.getLatLng()));
    } else {
      marker.current.setLatLng([la, lo]);
    }
    map.current.setView([la, lo], zoom);
    settle({ lat: la, lng: lo }, viaAddress);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await leaflet();
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

      // No pin until there is something to pin. An unplaced report should not
      // show a marker sitting in the middle of the country.
      if (hasFix) {
        marker.current = L.marker(start, {
          draggable: true,
          icon: makeIcon(L),
          autoPan: true,
        }).addTo(map.current);
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

      // Tapping is easier than dragging on a phone held in one wet hand, and it
      // is the only way to place a pin that does not exist yet.
      map.current.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const Ll = await leaflet();
        if (!map.current) return;
        if (!marker.current) {
          marker.current = Ll.marker(e.latlng, {
            draggable: true,
            icon: makeIcon(Ll),
            autoPan: true,
          }).addTo(map.current);
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
    // Built once. Later coordinates come through the effect below, so rebuilding
    // never discards a pin the reporter already placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fix arriving later moves the pin, unless they positioned it themselves.
  // Their own placement always wins over the device's guess.
  useEffect(() => {
    if (moved || !hasFix || !map.current) return;
    (async () => {
      await placePin(lat, lon, 17, false);
      setMoved(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, hasFix]);

  // Reordering changes where the container sits, and Leaflet caches its size on
  // creation. Without this the tiles are laid out for the old position and the
  // map renders blank or half-drawn.
  useEffect(() => {
    if (!map.current) return;
    const id = setTimeout(() => map.current?.invalidateSize(), 60);
    return () => clearTimeout(id);
  }, [hasFix]);

  async function findOnMap() {
    const q = address.trim();
    if (q.length < 3) return;
    setSearching(true);
    setCandidates(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setCandidates(json.candidates ?? []);
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }

  async function grantLocation() {
    if (!onUseGps) return;
    setLocating(true);
    await onUseGps();
    setLocating(false);
  }

  const statusLine = moved ? (
    <span className="font-medium text-ok">{fromAddress ? t.pinFromAddress : t.pinPlaced}</span>
  ) : hasFix ? (
    <span>{t.fromPhone(accuracy !== null ? Math.round(accuracy) : null)}</span>
  ) : address.trim() ? (
    <span className="font-medium text-ok">{t.addressOnly}</span>
  ) : (
    <span className="font-medium text-critical">{t.noLocationYet}</span>
  );

  /* The written address. First when there is no fix, because it is then the only
     input the reporter can actually complete. */
  const addressBlock = (
    <div>
      <label htmlFor="address" className={`${t.face} block text-base font-semibold`}>
        {t.addressLabel}
      </label>
      <p className={`${t.face} mt-1 text-sm text-ink-soft`}>{t.addressHint}</p>
      <textarea
        id="address"
        value={address}
        onChange={(e) => {
          onAddressChange(e.target.value.slice(0, 500));
          setCandidates(null);
        }}
        dir="auto"
        rows={2}
        className="mt-2 w-full rounded-xl border border-day-line bg-day p-4 text-base outline-none focus:border-brand"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={findOnMap}
          disabled={searching || address.trim().length < 3}
          className={`${t.face} rounded-xl bg-brand/10 px-4 py-2.5 text-sm font-medium text-brand ring-1 ring-brand disabled:opacity-40`}
        >
          {searching ? t.searchingMap : t.findOnMap}
        </button>
        {address.trim() && !searching ? (
          <span className={`${t.face} text-sm text-ok`}>{t.addressSaved}</span>
        ) : null}
      </div>

      {/* Candidates, never applied on their own. The full matched name is shown
          because it is the only thing that lets someone notice their address
          resolved to a city 200km away. */}
      {candidates !== null && !searching ? (
        candidates.length === 0 ? (
          <p className={`${t.face} mt-3 rounded-xl bg-day p-3 text-sm text-ink-soft ring-1 ring-day-line`}>
            {t.geocodeNone}
          </p>
        ) : (
          <div className="mt-3">
            <p className={`${t.face} text-sm font-medium`}>{t.geocodePick}</p>
            <p className={`${t.face} mt-0.5 text-xs text-warn`}>{t.geocodeWarn}</p>
            <div className="mt-2 space-y-2">
              {candidates.map((c) => (
                <button
                  key={`${c.lat},${c.lon}`}
                  type="button"
                  onClick={() => {
                    placePin(c.lat, c.lon, 15, true);
                    setCandidates(null);
                  }}
                  className="block w-full rounded-xl border border-day-line bg-day p-3 text-start"
                >
                  <span className={`${t.face} block text-sm leading-snug`} dir="auto">
                    {c.label}
                  </span>
                  {c.kind ? (
                    <span className="en mt-0.5 block text-xs text-ink-soft">{c.kind}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );

  const mapBlock = (
    <div>
      {!hasFix ? <p className={`${t.face} mb-2 text-sm text-ink-soft`}>{t.orPlaceOnMap}</p> : null}
      <div
        dir="ltr"
        ref={container}
        className="h-64 w-full overflow-hidden rounded-2xl ring-1 ring-day-line"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`${t.face} text-xs text-ink-soft`}>{statusLine}</p>
        {/* The second permission ask, made where its purpose is self-evident. */}
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
    </div>
  );

  return (
    <div>
      <div className="mb-3">
        <h3 className={`${t.face} text-base font-semibold`}>{t.confirmPlace}</h3>
        {/* Not addressHint: that belongs to the address field below, and
            repeating it here printed the same sentence twice on one screen. */}
        <p className={`${t.face} text-sm text-ink-soft`}>{hasFix ? t.dragPin : t.placeIntro}</p>
      </div>

      {/* Both blocks stay mounted and swap with CSS order, never by branching
          into two different trees. Branching unmounted the map container the
          moment a pin arrived, React tore the Leaflet instance down with it, and
          the build effect runs once so nothing rebuilt it: the map went blank at
          exactly the moment the reporter had just placed their location. */}
      <div className="flex flex-col gap-5">
        <div className={hasFix ? "order-2 border-t border-day-line pt-4" : "order-1"}>
          {addressBlock}
        </div>
        <div className={hasFix ? "order-1" : "order-2 border-t border-day-line pt-4"}>
          {mapBlock}
        </div>
      </div>
    </div>
  );
}
