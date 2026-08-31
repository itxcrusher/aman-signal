"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DISTRICTS, districtName } from "@/lib/districts";
import type { OpsStrings } from "@/lib/i18n-ops";
import type { Lang } from "@/lib/i18n";

/**
 * Pick one district out of fifty-seven.
 *
 * Previously every district was rendered at once as a wrap of chips grouped by
 * province, which is a reasonable shape for five options and a wall at fifty:
 * finding your own district meant scanning the whole country, and the picker was
 * taller than the screen before the operator had typed anything.
 *
 * A combobox instead. Closed it states the current choice in one line; open it
 * filters as you type. Province headings survive inside the list, because
 * "Sahiwal" is ambiguous to someone who knows there is a Sahiwal District and a
 * Sahiwal Tehsil, and the province settles it.
 */
export default function DistrictSelect({
  value,
  onChange,
  t,
  lang,
}: {
  value: string;
  onChange: (id: string) => void;
  t: OpsStrings;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DISTRICTS;
    return DISTRICTS.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.nameUrdu.includes(query.trim()) ||
        d.province.toLowerCase().includes(q),
    );
  }, [query]);

  // Grouped for display, flat for keyboard navigation: arrow keys should not
  // have to know that headings exist.
  const grouped = useMemo(() => {
    const by: Record<string, typeof DISTRICTS> = {};
    for (const d of matches) (by[d.province] ??= []).push(d);
    return Object.entries(by);
  }, [matches]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  // Click-away, so an open list does not sit over the board indefinitely.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && matches[active]) {
      e.preventDefault();
      choose(matches[active].id);
    }
  }

  const selected = value ? DISTRICTS.find((d) => d.id === value) : null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-start text-paper"
      >
        <span className={selected ? "text-paper" : "text-paper-soft"}>
          {selected ? (
            <>
              {selected.name}
              <span className="urdu-ui ms-2 text-paper-soft">{selected.nameUrdu}</span>
              <span className="ms-2 text-xs text-paper-soft">{selected.province}</span>
            </>
          ) : (
            t.searchDistricts
          )}
        </span>
        <span aria-hidden className="text-paper-soft">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={t.searchDistricts}
            aria-label={t.searchDistricts}
            dir="auto"
            className="w-full border-b border-line bg-surface-2 px-4 py-3 text-paper outline-none"
          />
          <div role="listbox" className="max-h-72 overflow-y-auto p-1">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-sm text-paper-soft">{t.noDistrictMatch}</p>
            ) : null}
            {grouped.map(([province, list]) => (
              <div key={province}>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-paper-soft">
                  {province}
                </p>
                {list.map((d) => {
                  const idx = matches.indexOf(d);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={value === d.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(d.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm ${
                        idx === active
                          ? "bg-brand text-white"
                          : value === d.id
                            ? "bg-surface-2 text-paper"
                            : "text-paper-soft"
                      }`}
                    >
                      <span>{d.name}</span>
                      <span className="urdu-ui opacity-80">{d.nameUrdu}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <span className="sr-only">{districtName(value, lang === "ur")}</span>
    </div>
  );
}
