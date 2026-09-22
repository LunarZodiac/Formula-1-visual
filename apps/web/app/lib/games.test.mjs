import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  distanceKm,
  answerNearGuess,
  scoreRound,
  rankForXp,
  shuffled,
  readProgress,
  emptyProgress,
  awardSession,
  xpForScore,
  outlinePoints,
} from "./games-engine.ts";

test("geodesic distance covers identical, antipodal and antimeridian points", () => {
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
  assert.ok(Math.abs(distanceKm([0, 0], [180, 0]) - 20015.114) < 0.01);
  assert.ok(Math.abs(distanceKm([179, 0], [-179, 0]) - 222.39) < 0.01);
  assert.equal(
    distanceKm([12, 43], [15, -31]),
    distanceKm([15, -31], [12, 43]),
  );
});
test("map result uses the shortest visual path across the antimeridian", () => {
  assert.equal(answerNearGuess(179, -179), 181);
  assert.equal(answerNearGuess(-179, 179), -181);
  assert.equal(answerNearGuess(10, 20), 20);
});
test("scores are bounded, monotonic, difficulty and hint have stated effects", () => {
  assert.equal(scoreRound("outline", true, null, false, "easy"), 1000);
  assert.equal(scoreRound("outline", false, null, true, "hard"), 0);
  assert.equal(scoreRound("outline", true, null, true, "hard"), 750);
  assert.equal(scoreRound("map", false, null, false, "easy"), 0);
  assert.equal(scoreRound("map", false, NaN, false, "easy"), 0);
  let previous = 1001;
  for (const km of [0, 1, 100, 500, 1000, 5000, 20000]) {
    const score = scoreRound("map", false, km, false, "easy");
    assert.ok(score >= 0 && score <= previous);
    assert.ok(scoreRound("map", false, km, false, "hard") <= score);
    previous = score;
  }
});
test("progress validates corrupt storage, keeps records and awards session once", () => {
  assert.deepEqual(readProgress("{broken"), emptyProgress());
  assert.deepEqual(readProgress('{"xp":-1}'), emptyProgress());
  let p = awardSession(emptyProgress(), "a", "map-easy-false", 5000);
  assert.equal(p.xp, 125);
  assert.equal(awardSession(p, "a", "map-easy-false", 5000), p);
  p = awardSession(p, "b", "map-easy-false", 2000);
  assert.equal(p.records["map-easy-false"], 5000);
  assert.equal(p.xp, 190);
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
  assert.equal(rankForXp(0).name, "Новичок");
  assert.equal(rankForXp(0).badge, "01");
  assert.equal(rankForXp(499).next, 500);
  assert.equal(rankForXp(500).name, "Маршал");
  assert.equal(rankForXp(1500).reward, "Бирюзовая метка звания");
  assert.equal(rankForXp(7000).next, null);
  assert.equal(rankForXp(7000).level, 5);
  assert.equal(xpForScore(0), 25);
  assert.equal(xpForScore(5000), 125);
  assert.equal(xpForScore(Number.NaN), 25);
});
test("shuffle preserves unique candidates and does not mutate source", () => {
  const input = ["a", "b", "c", "d", "e"];
  assert.deepEqual(shuffled(input).sort(), input);
  assert.deepEqual(input, ["a", "b", "c", "d", "e"]);
});
test("outlines preserve vertex count, proportions and finite coordinates", () => {
  const coords = [
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 0],
  ];
  const points = outlinePoints(coords)
    .split(" ")
    .map((p) => p.split(",").map(Number));
  assert.equal(points.length, coords.length);
  const width = points[1][0] - points[0][0],
    height = points[1][1] - points[2][1];
  assert.ok(Math.abs(width / height - 2) < 0.001);
  assert.ok(points.flat().every(Number.isFinite));
  assert.equal(
    outlinePoints([
      [0, 0],
      [0, 0],
      [0, 0],
    ]),
    "",
  );
  assert.equal(
    outlinePoints([
      [0, 0],
      [1, NaN],
      [2, 2],
    ]),
    "",
  );
});
test("real source contours all retain original vertices", () => {
  const data = JSON.parse(
    readFileSync(new URL("../data/circuits.json", import.meta.url), "utf8"),
  );
  for (const feature of data.features) {
    const result = outlinePoints(feature.geometry.coordinates);
    assert.equal(result.split(" ").length, feature.geometry.coordinates.length);
    assert.ok(!result.includes("NaN"));
  }
});
