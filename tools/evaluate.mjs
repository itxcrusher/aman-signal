/**
 * AmanSignal evaluation suite.
 *
 * Measures the behaviour the product depends on, against labelled cases in
 * eval/cases.json:
 *
 *   field accuracy       do stated facts land in the right schema fields
 *   invention rate       are fields the report NEVER stated left empty
 *   negative handling    is a non-emergency refused rather than force-fitted
 *   dedup precision      do reports of one event cluster, and lookalikes not
 *   latency              p50 / p95 end to end
 *
 * The invention rate is the number that matters most: a fabricated location or head
 * count sends a rescue team to the wrong place. It is reported separately from a
 * stricter count that also includes vague echoes of words the report did contain.
 *
 * USAGE
 *   npm run dev                 # in another terminal
 *   node tools/evaluate.mjs                 # extraction cases only
 *   node tools/evaluate.mjs --with-dedup    # also run the clustering sets (slower)
 *   node tools/evaluate.mjs --json out.json
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AMANSIGNAL_BASE ?? "http://localhost:3000";
const WITH_DEDUP = process.argv.includes("--with-dedup");
const jsonIdx = process.argv.indexOf("--json");
const JSON_OUT = jsonIdx !== -1 ? process.argv[jsonIdx + 1] : null;

const spec = JSON.parse(fs.readFileSync(path.join("eval", "cases.json"), "utf8"));

async function extract(text) {
  const fd = new FormData();
  fd.set("text", text);
  const started = Date.now();
  const r = await fetch(`${BASE}/api/report`, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return { ...j, wallMs: Date.now() - started };
}

const checks = {
  language_detected: (e, v) => e.language_detected === v,
  incident_type: (e, v) => e.incident_type === v,
  incident_type_one_of: (e, v) => v.includes(e.incident_type),
  people_affected: (e, v) => e.people_affected === v,
  road_access: (e, v) => e.road_access === v,
  urgency_includes: (e, v) => v.every((x) => e.urgency_indicators.includes(x)),
  vulnerable_includes: (e, v) => v.every((x) => e.vulnerable_people.includes(x)),
  resources_includes: (e, v) => v.every((x) => e.resources_required.includes(x)),
  locations_nonempty: (e) => e.locations_mentioned.length > 0,
  urgency_empty: (e) => e.urgency_indicators.length === 0,
  missing_nonempty: (e) => e.missing_information.length > 0,
  missing_mentions: (e, v) => {
    const hay = e.missing_information.join(" ").toLowerCase();
    return v.every((t) => hay.includes(t));
  },
};

/**
 * Two different failures get conflated as "hallucination", and only one is dangerous.
 *
 * SUBSTANTIVE: the model asserted something the report never said, for example a
 * place name or a head count that appears nowhere in the source. A fabricated
 * location sends a rescue team to the wrong address.
 *
 * VAGUE: the model echoed a word that is present in the report but carries no
 * operational information, such as "ghar" (house) from "pani ghar mein aa gaya".
 * Nothing is invented; the value is simply not usable, which the clarification loop
 * already handles by asking for a real location.
 *
 * Both are counted, separately, because reporting only the strict number overstates
 * the risk and reporting only the substantive one hides a real usability gap.
 */
const VAGUE_LOCATION = /^(hamare?|mere?|humara|apna|our|my)?\s*(ghar|home|house|area|mohalla|gaon|village|street|gali|yahan|here|upar|neeche|andar|bahar)$/i;

function classifyInvention(extraction, field, sourceText) {
  const v = extraction[field];
  const src = sourceText.toLowerCase();

  if (field === "locations_mentioned") {
    const values = Array.isArray(v) ? v : [];
    if (values.length === 0) return null;
    // Substantive only when it is neither a vague word nor traceable to the source.
    const substantive = values.filter((loc) => {
      const t = String(loc).trim();
      if (VAGUE_LOCATION.test(t)) return false;
      return !src.includes(t.toLowerCase().split(/[,،]/)[0].trim());
    });
    return substantive.length ? { kind: "substantive", detail: substantive.join("; ") }
                              : { kind: "vague", detail: values.join("; ") };
  }

  if (Array.isArray(v)) return v.length ? { kind: "substantive", detail: v.join("; ") } : null;
  if (v === null || v === undefined || v === "" || v === "unknown") return null;
  return { kind: "substantive", detail: String(v) };
}

async function runExtraction() {
  const results = [];
  let assertionsPassed = 0, assertionsTotal = 0;
  let substantive = 0, vague = 0, hallucinationOpportunities = 0;
  const latencies = [];

  for (const c of spec.cases) {
    process.stdout.write(`  ${c.id} ... `);
    let row;
    try {
      const res = await extract(c.text);
      const e = res.extraction;
      latencies.push(res.latency_ms);

      const failures = [];
      for (const [key, expected] of Object.entries(c.expect ?? {})) {
        assertionsTotal++;
        const fn = checks[key];
        if (!fn) { failures.push(`unknown check ${key}`); continue; }
        if (fn(e, expected)) assertionsPassed++;
        else failures.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(
          key.startsWith("urgency") ? e.urgency_indicators
          : key.startsWith("vulnerable") ? e.vulnerable_people
          : key.startsWith("resources") ? e.resources_required
          : key.startsWith("locations") ? e.locations_mentioned
          : key.startsWith("missing") ? e.missing_information
          : e[key])}`);
      }

      const invented = [], vagueFields = [];
      for (const field of c.must_be_absent ?? []) {
        hallucinationOpportunities++;
        const cls = classifyInvention(e, field, c.text);
        if (cls?.kind === "substantive") { substantive++; invented.push(`${field} (${cls.detail})`); }
        else if (cls?.kind === "vague") { vague++; vagueFields.push(`${field} (${cls.detail})`); }
      }

      row = {
        id: c.id, note: c.note, ok: failures.length === 0 && invented.length === 0,
        failures, invented, vague: vagueFields, latency_ms: res.latency_ms, repairs: res.repairs ?? [],
      };
    } catch (err) {
      row = { id: c.id, note: c.note, ok: false, error: err.message, failures: [], invented: [] };
    }
    results.push(row);
    console.log(row.ok ? "pass" : row.error ? `ERROR ${row.error}` : `FAIL (${[...row.failures, ...row.invented.map((f) => `invented ${f}`)].length})`);
    for (const f of row.failures ?? []) console.log(`      - ${f}`);
    for (const f of row.invented ?? []) console.log(`      - INVENTED ${f}`);
    for (const f of row.vague ?? []) console.log(`      - vague echo (present in source, not usable): ${f}`);
  }

  const sorted = latencies.slice().sort((a, b) => a - b);
  return {
    results,
    summary: {
      cases: spec.cases.length,
      cases_passed: results.filter((r) => r.ok).length,
      assertions: assertionsTotal,
      assertions_passed: assertionsPassed,
      field_accuracy_pct: assertionsTotal ? +((100 * assertionsPassed) / assertionsTotal).toFixed(1) : null,
      hallucination_opportunities: hallucinationOpportunities,
      substantive_inventions: substantive,
      vague_echoes: vague,
      substantive_rate_pct: hallucinationOpportunities
        ? +((100 * substantive) / hallucinationOpportunities).toFixed(1) : null,
      strict_rate_pct: hallucinationOpportunities
        ? +((100 * (substantive + vague)) / hallucinationOpportunities).toFixed(1) : null,
      latency_ms: sorted.length
        ? { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] }
        : null,
    },
  };
}

async function confirm(reportId, questions) {
  const answers = (questions ?? []).map((q) => ({
    field: q.field, question: q.en,
    answer: q.field === "location" ? "near the mosque" : "3",
  }));
  const r = await fetch(`${BASE}/api/report/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, answers }),
  });
  return r.json();
}

async function runDedup() {
  const out = [];
  for (const set of spec.dedup_sets) {
    process.stdout.write(`  ${set.id} ... `);
    // Each set runs against a clean board so clusters cannot leak between sets.
    const { execFileSync } = await import("node:child_process");
    execFileSync(process.execPath, ["tools/reset-data.mjs"], { stdio: "pipe" });

    const incidentIds = [];
    for (const rep of set.reports) {
      const fd = new FormData();
      fd.set("text", rep.text);
      fd.set("lat", String(rep.lat));
      fd.set("lon", String(rep.lon));
      const sub = await (await fetch(`${BASE}/api/report`, { method: "POST", body: fd })).json();
      const res = await confirm(sub.report_id, sub.questions);
      incidentIds.push(res.incident_id ?? `held:${sub.report_id}`);
    }
    const distinct = new Set(incidentIds).size;
    const clustered = distinct === 1;
    const held = incidentIds.filter((i) => String(i).startsWith("held:")).length;
    // A held report is neither a correct merge nor a wrong one: it is the system
    // declining to decide, which is counted separately rather than as a pass.
    const ok = held === 0 && clustered === set.expect_same_cluster;
    console.log(ok ? "pass" : held ? `held ${held}/${set.reports.length} for review` : "FAIL");
    out.push({ id: set.id, note: set.note, expect_same_cluster: set.expect_same_cluster,
               distinct_incidents: distinct, held_for_review: held, ok });
  }
  return out;
}

(async () => {
  try {
    await fetch(`${BASE}/api/incidents`, { cache: "no-store" });
  } catch {
    console.error(`Cannot reach ${BASE}. Start the dev server first: npm run dev`);
    process.exit(1);
  }

  console.log("Extraction cases:");
  const ex = await runExtraction();
  let dedup = null;
  if (WITH_DEDUP) {
    console.log("\nDeduplication sets:");
    dedup = await runDedup();
  }

  const s = ex.summary;
  console.log("\n" + "=".repeat(62));
  console.log(`cases passed        ${s.cases_passed}/${s.cases}`);
  console.log(`field accuracy      ${s.field_accuracy_pct}%  (${s.assertions_passed}/${s.assertions} assertions)`);
  console.log(`invention rate      ${s.substantive_rate_pct}%  (${s.substantive_inventions}/${s.hallucination_opportunities} absent fields given a fabricated value)`);
  console.log(`  strict rate       ${s.strict_rate_pct}%  (counting ${s.vague_echoes} vague echo(es) of words present in the report)`);
  if (s.latency_ms) console.log(`latency             p50 ${s.latency_ms.p50}ms  p95 ${s.latency_ms.p95}ms  max ${s.latency_ms.max}ms`);
  if (dedup) {
    const passed = dedup.filter((d) => d.ok).length;
    console.log(`dedup sets          ${passed}/${dedup.length} correct`);
  }
  console.log("=".repeat(62));

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ generated_at: new Date().toISOString(), ...ex, dedup }, null, 1));
    console.log(`wrote ${JSON_OUT}`);
  }
})();
