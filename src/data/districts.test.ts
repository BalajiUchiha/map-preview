import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DISTRICTS, filterStudents, getDistanceKm, getNearbyStudents } from "./districts.ts";

test("getDistanceKm computes 0 for identical coordinates and accurate Chennai-Madurai range", () => {
  assert.equal(getDistanceKm(13.055, 80.225, 13.055, 80.225), 0);
  const km = getDistanceKm(13.0827, 80.2707, 9.9252, 78.1198);
  assert.ok(km > 400 && km < 450, `Expected 400-450 km, got ${km}`);
});

test("filterStudents applies stream, eligibility, and search filters accurately", () => {
  const sample = DISTRICTS[0].students;
  assert.equal(filterStudents(sample, "all", "").length, sample.length);
  assert.ok(filterStudents(sample, "above_1lakh", "").every((s) => s.familyIncome > 100000));
  assert.ok(filterStudents(sample, "own_house", "").every((s) => s.ownHouse === "Yes"));
  assert.ok(filterStudents(sample, "eng", "").every((s) => s.opted === "Eng"));

  const target = sample[0];
  const byMarks = filterStudents(sample, "all", String(target.marks));
  assert.ok(byMarks.some((s) => s.id === target.id));
});

test("getNearbyStudents stays consistent with nearToApplicants and handles fallback", () => {
  for (const district of DISTRICTS.slice(0, 5)) {
    for (const vol of district.volunteers) {
      const { withinRadius, displayList, usedFallback } = getNearbyStudents(vol, district.students);
      assert.equal(withinRadius.length, vol.nearToApplicants);
      if (usedFallback) {
        assert.ok(displayList.length <= 4 && displayList.every((item) => item.dist > 5));
      } else {
        assert.deepEqual(displayList, withinRadius);
      }
    }
  }
});

test("all 38 districts have boundary metadata and lazy public GeoJSON files", () => {
  assert.equal(DISTRICTS.length, 38);
  const metaPath = path.join(process.cwd(), "src/data/districtBoundaryMeta.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, { urbanBounds: number[][] }>;

  for (const d of DISTRICTS) {
    assert.ok(meta[d.name]?.urbanBounds?.length === 2, `Missing urbanBounds for ${d.name}`);
    const geoPath = path.join(process.cwd(), "public/boundaries", `${d.name}.json`);
    assert.ok(fs.existsSync(geoPath), `Missing GeoJSON file for ${d.name}`);
  }
});
