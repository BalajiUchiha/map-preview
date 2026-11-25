import type { GeoJsonObject } from "geojson";
import rawMeta from "./districtBoundaryMeta.json";

export interface DistrictBoundaryMeta {
  name: string;
  center: [number, number];
  urbanCenter: [number, number];
  urbanBounds: [[number, number], [number, number]];
  maxBounds: [[number, number], [number, number]];
}

export const DISTRICT_BOUNDARIES = rawMeta as unknown as Record<string, DistrictBoundaryMeta>;

const boundaryGeoCache = new Map<string, GeoJsonObject>();

export function getDistrictBoundary(districtName: string): DistrictBoundaryMeta | null {
  return DISTRICT_BOUNDARIES[districtName] ?? null;
}

/** Lazily loads and caches a single district's GeoJSON polygon from /public/boundaries. */
export async function fetchDistrictGeoJson(
  districtName: string,
  signal?: AbortSignal
): Promise<GeoJsonObject | null> {
  const cached = boundaryGeoCache.get(districtName);
  if (cached) return cached;

  const res = await fetch(`/boundaries/${encodeURIComponent(districtName)}.json`, { signal });
  if (!res.ok) return null;

  const data = (await res.json()) as GeoJsonObject;
  boundaryGeoCache.set(districtName, data);
  return data;
}
