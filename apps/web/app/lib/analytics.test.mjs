import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

// Node strips TS types; resolve the extensionless imports used by the web app.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
const { buildAnalytics } = await import("./analytics-data.ts");
const { loadAnalyticsSeasons } = await import("./analytics-loader.ts");
const driver = { id: "test", nameRu: "Тест", nameEn: "Test", code: "TST" };
const colors = new Map([["test", "#ff2447"]]);
const result = (position, points = 0) => ({
  driverId: "test",
  position,
  points,
  code: "TST",
});
function fixture(season) {
  return {
    season,
    exportedAt: "2026-09-13",
    calendar: [
      {
        id: `${season}-01`,
        round: 1,
        name: "Race",
        status: "completed",
        circuit: {
          id: "monaco",
          name: "Circuit de Monaco",
          countryCode: "MC",
          type: "street",
          coordinates: [7.4, 43.7],
        },
      },
    ],
    standings: { drivers: [], constructors: [] },
    raceResults: {},
    sprintResults: {},
    qualifyingResults: {},
  };
}

test("career deduplicates seasons, keeps round identities, weighted mean and circuit totals", () => {
  const first = fixture(2024);
  first.raceResults = { 1: [result(1, 25)] };
  first.qualifyingResults = { 1: [result(1)] };
  first.sprintResults = { 1: [result(1, 8)] };
  const second = fixture(2025);
  second.calendar.push({ ...second.calendar[0], id: "2025-02", round: 2 });
  second.raceResults = { 1: [result(3, 15)], 2: [result(8, 4)] };
  second.standings.drivers = [{ driverId: "test", points: 17 }];
  const value = buildAnalytics([first, second, first], [driver], colors);
  const metric = value.metrics[0];
  assert.equal(metric.starts, 3);
  assert.equal(metric.wins, 1);
  assert.equal(metric.sprintWins, 1);
  assert.equal(metric.podiums, 2);
  assert.equal(metric.poles, 1);
  assert.equal(metric.averageFinish, 4);
  assert.equal(metric.points, 50);
  assert.equal(value.circuitMetrics.length, 1);
  assert.equal(value.circuitMetrics[0].points, 52);
  assert.equal(value.circuitMetrics[0].name, "Монако");
  assert.deepEqual(value.circuitMetrics[0].coordinates, [7.4, 43.7]);
  assert.equal(value.coverage.missingQualifyingRounds, 2);
});

test("no results is not a zero average; qualifying-only result still appears", () => {
  const snapshot = fixture(2000);
  snapshot.qualifyingResults = { 1: [result(1)] };
  const value = buildAnalytics([snapshot], [driver], colors);
  assert.equal(value.metrics[0].averageFinish, null);
  assert.equal(value.metrics[0].starts, 0);
  assert.equal(value.circuitMetrics[0].poles, 1);
});

test("DNS and withdrawn entries with numeric positions are not starts or finishes", () => {
  const snapshot = fixture(2020);
  snapshot.raceResults = {
    1: [
      { ...result(20), status: "Did not start" },
      { ...result(19), positionText: "W" },
      { ...result(18), status: "Withdrew" },
    ],
  };
  const { metrics } = buildAnalytics([snapshot], [driver], colors);
  assert.equal(metrics[0].starts, 0);
  assert.equal(metrics[0].averageFinish, null);
});

test("historical Withdrew with racing laps retains its start, classification and points", () => {
  const snapshot = fixture(1996);
  snapshot.raceResults = {
    1: [{ ...result(4, 3), status: "Withdrew", positionText: "W", laps: 74 }],
  };
  const { metrics, circuitMetrics } = buildAnalytics(
    [snapshot],
    [driver],
    colors,
  );
  assert.equal(metrics[0].starts, 1);
  assert.equal(metrics[0].averageFinish, 4);
  assert.equal(circuitMetrics[0].points, 3);
});

test("actual 2024 snapshot totals agree with independent counting", () => {
  const snapshot = JSON.parse(
    readFileSync(
      new URL("../../public/data/f1/season-2024.json", import.meta.url),
      "utf8",
    ),
  );
  const selected = { ...driver, id: "max_verstappen" };
  const value = buildAnalytics([snapshot], [selected], colors);
  const rows = Object.values(snapshot.raceResults)
    .flat()
    .filter((row) => row.driverId === selected.id);
  assert.equal(value.metrics[0].starts, rows.length);
  assert.equal(
    value.metrics[0].wins,
    rows.filter((row) => row.position === 1).length,
  );
  assert.equal(
    value.metrics[0].podiums,
    rows.filter((row) => row.position <= 3).length,
  );
});

test("loader bounds concurrency, reports progress, caches successes and rejects incomplete careers", async () => {
  const original = globalThis.fetch;
  let active = 0;
  let peak = 0;
  let calls = 0;
  const progress = [];
  globalThis.fetch = async (url) => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    const year = Number(String(url).match(/season-(\d+)/)[1]);
    return new Response(JSON.stringify(fixture(year)), {
      status: year === 1999 ? 503 : 200,
    });
  };
  try {
    const years = [1990, 1991, 1992, 1993, 1994];
    const loaded = await loadAnalyticsSeasons(
      years,
      new AbortController().signal,
      (n, total) => progress.push([n, total]),
    );
    assert.equal(peak, 3);
    assert.deepEqual(
      loaded.map((s) => s.season),
      years,
    );
    assert.deepEqual(progress.at(-1), [5, 5]);
    await loadAnalyticsSeasons(years, new AbortController().signal);
    assert.equal(calls, 5);
    await assert.rejects(
      loadAnalyticsSeasons([1999], new AbortController().signal),
      /1999/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadAnalyticsSeasons([1990], controller.signal), {
      name: "AbortError",
    });
  } finally {
    globalThis.fetch = original;
  }
});
