"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker, LayerGroup } from "leaflet";

export type MapIncident = {
  id: string;
  lat: number | null;
  lon: number | null;
  status: string;
  summary: string | null;
  signal: number;
  quality: { distinctReports: number };
  conflicts: unknown[];
};

/**
 * Incidents plotted geographically. Reports of one emergency reconcile into a single
 * marker, so a street with five callers reads as one place needing a boat rather than
 * five separate pins, which is the whole point of the deduplication layer.
 *
 * Leaflet is loaded dynamically because it touches `window` at import time.
 */
export default function IncidentMap({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: MapIncident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const markers = useRef<Record<string, CircleMarker>>({});

  const placed = incidents.filter(
    (i): i is MapIncident & { lat: number; lon: number } => i.lat !== null && i.lon !== null,
  );
  const unplaced = incidents.length - placed.length;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current) return;

      map.current = L.map(container.current, {
        zoomControl: true,
        attributionControl: true,
        // Scroll should move the page, not the map: an operator scanning the board
        // must not have the list yanked away by an accidental zoom.
        scrollWheelZoom: false,
      }).setView([30.3753, 69.3451], 5); // Pakistan, until incidents arrive

      // Standard OpenStreetMap tiles, which need no API key. CARTO's dark basemap
      // watermarks every tile with "API KEY REQUIRED" unless registered, which on a
      // dispatcher board reads as a broken deployment. The dark appearance is applied
      // in CSS to the tile pane instead, so no key can ever expire mid-demo.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map.current);

      layer.current = L.layerGroup().addTo(map.current);
      draw(L);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when the incident set changes.
  useEffect(() => {
    if (!map.current || !layer.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      draw(L);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);

  // Highlight whichever incident the operator has open in the list.
  useEffect(() => {
    for (const [id, m] of Object.entries(markers.current)) {
      const on = id === selectedId;
      m.setStyle({ weight: on ? 4 : 2, fillOpacity: on ? 0.95 : 0.7 });
      if (on) m.bringToFront();
    }
    if (selectedId && markers.current[selectedId] && map.current) {
      const ll = markers.current[selectedId].getLatLng();
      map.current.panTo(ll, { animate: true });
    }
  }, [selectedId]);

  async function draw(L: typeof import("leaflet")) {
    if (!layer.current || !map.current) return;
    layer.current.clearLayers();
    markers.current = {};

    for (const inc of placed) {
      // Size carries corroboration, colour carries state. Neither encodes priority:
      // the operator decides that, and a map that ranked emergencies would be
      // making the call the product refuses to make.
      const radius = 8 + Math.min(inc.quality.distinctReports - 1, 4) * 3;
      const color =
        inc.status === "resolved" ? "#64748b"
        : inc.status === "responding" ? "#0f9d94"
        : inc.status === "assigned" ? "#3b82f6"
        : inc.status === "verified" ? "#d97706"
        : "#dc2626";

      const marker = L.circleMarker([inc.lat, inc.lon], {
        radius,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.7,
      });

      const reports = inc.quality.distinctReports;
      marker.bindTooltip(
        `<strong>${inc.status.toUpperCase()}</strong><br>${
          (inc.summary ?? "").slice(0, 90)
        }<br>${reports} report${reports === 1 ? "" : "s"}${
          inc.conflicts.length ? ` &middot; ${inc.conflicts.length} conflict${inc.conflicts.length === 1 ? "" : "s"}` : ""
        }`,
        { direction: "top", opacity: 0.95 },
      );
      marker.on("click", () => onSelect(inc.id));
      marker.addTo(layer.current);
      markers.current[inc.id] = marker;
    }

    if (placed.length) {
      const bounds = L.latLngBounds(placed.map((i) => [i.lat, i.lon] as [number, number]));
      map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-paper-soft">
          Incident map
        </h2>
        <p className="text-xs text-paper-soft">
          Marker size shows how many reports back an incident.
          {unplaced > 0 ? (
            <span className="ml-2 text-amber-300">
              {unplaced} incident{unplaced === 1 ? "" : "s"} without a location cannot be mapped
            </span>
          ) : null}
        </p>
      </div>
      <div ref={container} className="ops-map h-[380px] w-full bg-ground" />
    </div>
  );
}
