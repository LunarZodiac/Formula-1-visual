import {
  snapshotToCircuits,
  type SeasonSnapshot,
  type SnapshotSessionResult,
} from "../data/web-snapshots";

export type AnalyticsDriverOption = {
  id: string;
  nameRu: string;
  nameEn: string;
  code: string | null;
  firstSeason?: number;
  latestSeason?: number;
};
export type DriverMetric = {
  driver: AnalyticsDriverOption;
  color: string;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  points: number;
  racePoints: number;
  sprintStarts: number;
  sprintPodiums: number;
  sprintPoints: number;
  sprintAverageFinish: number | null;
  sprintFinishCount: number;
  sprintFinishSum: number;
  qualifyingEntries: number;
  averageQualifying: number | null;
  qualifyingPositionCount: number;
  qualifyingPositionSum: number;
  averageFinish: number | null;
  finishCount: number;
  finishSum: number;
};
export type CircuitMetric = {
  circuitId: string;
  name: string;
  locality: string | null;
  countryCode: string;
  coordinates: [number, number];
  driverId: string;
  driverName: string;
  driverCode: string;
  color: string;
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  sprintWins: number;
  points: number;
  racePoints: number;
  sprintStarts: number;
  sprintPodiums: number;
  sprintPoints: number;
  qualifyingEntries: number;
};

function position(row: SnapshotSessionResult) {
  return Number.isInteger(row.position) && row.position > 0
    ? row.position
    : null;
}

function didStart(row: SnapshotSessionResult) {
  // Historical "Withdrew" also describes retirement after many racing laps.
  if (row.laps !== null && row.laps > 0) return true;
  return (
    !/^(did not start|did not qualify|did not prequalify|withdrew|withdrawn)$/i.test(
      row.status ?? "",
    ) && !/^(W|DNS|DNQ|DNPQ)$/i.test(row.positionText ?? "")
  );
}

/** Aggregate seasons independently: rounds restart every year, and career average
 * must be weighted by result count rather than averaging seasonal averages. */
export function buildAnalytics(
  snapshots: SeasonSnapshot[],
  drivers: AnalyticsDriverOption[],
  colors: Map<string, string>,
) {
  const metrics: DriverMetric[] = drivers.map((driver) => ({
    driver,
    color: colors.get(driver.id) ?? "#ff2447",
    starts: 0,
    wins: 0,
    podiums: 0,
    poles: 0,
    sprintWins: 0,
    points: 0,
    racePoints: 0,
    sprintStarts: 0,
    sprintPodiums: 0,
    sprintPoints: 0,
    sprintAverageFinish: null,
    sprintFinishCount: 0,
    sprintFinishSum: 0,
    qualifyingEntries: 0,
    averageQualifying: null,
    qualifyingPositionCount: 0,
    qualifyingPositionSum: 0,
    averageFinish: null,
    finishCount: 0,
    finishSum: 0,
  }));
  const byDriver = new Map(metrics.map((metric) => [metric.driver.id, metric]));
  const byCircuit = new Map<string, CircuitMetric>();
  const coverage = {
    seasons: [] as number[],
    raceRounds: 0,
    qualifyingRounds: 0,
    missingQualifyingRounds: 0,
  };
  const seasons = [
    ...new Map(
      snapshots.map((snapshot) => [snapshot.season, snapshot]),
    ).values(),
  ].sort((a, b) => a.season - b.season);
  for (const snapshot of seasons) {
    coverage.seasons.push(snapshot.season);
    const circuits = new Map(
      snapshotToCircuits(snapshot).map((circuit) => [circuit.order, circuit]),
    );
    const calendar = new Map(
      snapshot.calendar.map((race) => [race.round, race]),
    );
    const earnedPoints = new Map<string, number>();
    const ensure = (
      round: number,
      metric: DriverMetric,
      row: SnapshotSessionResult,
    ) => {
      const circuit = circuits.get(round);
      const race = calendar.get(round);
      if (!circuit || !race) return null;
      const key = `${metric.driver.id}/${circuit.id}`;
      let item = byCircuit.get(key);
      if (!item) {
        item = {
          circuitId: circuit.id,
          name: circuit.name,
          locality: circuit.city,
          countryCode: race.circuit.countryCode,
          coordinates: circuit.coordinates,
          driverId: metric.driver.id,
          driverName: metric.driver.nameRu,
          driverCode: metric.driver.code ?? row.code ?? "—",
          color: metric.color,
          starts: 0,
          wins: 0,
          podiums: 0,
          poles: 0,
          sprintWins: 0,
          points: 0,
          racePoints: 0,
          sprintStarts: 0,
          sprintPodiums: 0,
          sprintPoints: 0,
          qualifyingEntries: 0,
        };
        byCircuit.set(key, item);
      }
      return item;
    };
    for (const [round, rows] of Object.entries(snapshot.raceResults ?? {})) {
      if (rows.some((row) => byDriver.has(row.driverId))) {
        coverage.raceRounds++;
        if (!snapshot.qualifyingResults?.[round]?.length)
          coverage.missingQualifyingRounds++;
      }
    }
    for (const key of [
      "raceResults",
      "sprintResults",
      "qualifyingResults",
    ] as const) {
      for (const [round, rows] of Object.entries(snapshot[key] ?? {})) {
        if (
          key === "qualifyingResults" &&
          rows.some((row) => byDriver.has(row.driverId))
        )
          coverage.qualifyingRounds++;
        for (const row of rows) {
          const metric = byDriver.get(row.driverId);
          if (!metric) continue;
          const circuit = ensure(Number(round), metric, row);
          if (!circuit) continue;
          const place = position(row);
          if (key === "qualifyingResults") {
            metric.qualifyingEntries++;
            circuit.qualifyingEntries++;
            if (place !== null) {
              metric.qualifyingPositionSum += place;
              metric.qualifyingPositionCount++;
            }
            if (place === 1) {
              metric.poles++;
              circuit.poles++;
            }
            continue;
          }
          // DNS/withdrawn entries can carry a numeric classification position.
          // They identify an entry, not an actual start or finishing result.
          if (!didStart(row)) continue;
          const points = Number.isFinite(row.points) ? row.points : 0;
          earnedPoints.set(
            row.driverId,
            (earnedPoints.get(row.driverId) ?? 0) + points,
          );
          circuit.points += points;
          if (key === "sprintResults") {
            metric.sprintStarts++;
            circuit.sprintStarts++;
            metric.sprintPoints += points;
            circuit.sprintPoints += points;
            if (place !== null) {
              metric.sprintFinishSum += place;
              metric.sprintFinishCount++;
            }
            if (place === 1) {
              metric.sprintWins++;
              circuit.sprintWins++;
            }
            if (place !== null && place <= 3) {
              metric.sprintPodiums++;
              circuit.sprintPodiums++;
            }
            continue;
          }
          metric.racePoints += points;
          circuit.racePoints += points;
          metric.starts++;
          circuit.starts++;
          if (place !== null) {
            metric.finishSum += place;
            metric.finishCount++;
          }
          if (place === 1) {
            metric.wins++;
            circuit.wins++;
          }
          if (place !== null && place <= 3) {
            metric.podiums++;
            circuit.podiums++;
          }
        }
      }
    }
    // Championship points can include dropped scores or penalties; preserve
    // official totals and keep race/sprint points separate in the circuit view.
    for (const metric of metrics) {
      const standing = snapshot.standings.drivers.find(
        (row) => row.driverId === metric.driver.id,
      );
      metric.points +=
        standing?.points ?? earnedPoints.get(metric.driver.id) ?? 0;
    }
  }
  for (const metric of metrics)
    {
      metric.averageFinish = metric.finishCount
        ? metric.finishSum / metric.finishCount
        : null;
      metric.sprintAverageFinish = metric.sprintFinishCount
        ? metric.sprintFinishSum / metric.sprintFinishCount
        : null;
      metric.averageQualifying = metric.qualifyingPositionCount
        ? metric.qualifyingPositionSum / metric.qualifyingPositionCount
        : null;
    }
  return { metrics, circuitMetrics: [...byCircuit.values()], coverage };
}
