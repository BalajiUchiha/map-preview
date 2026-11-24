import rawBoundaries from "./districtBoundaries.json";

export interface DistrictBoundaryMeta {
  name: string;
  type: string;
  features?: any[];
  geometry?: any;
  properties?: Record<string, any>;
  center: [number, number];
  urbanCenter: [number, number];
  bbox: [number, number, number, number];
  urbanBounds: [[number, number], [number, number]];
  maxBounds: [[number, number], [number, number]];
  bufferKm: number;
}

export const DISTRICT_BOUNDARIES: Record<string, DistrictBoundaryMeta> = rawBoundaries as unknown as Record<
  string,
  DistrictBoundaryMeta
>;

export function getDistrictBoundary(districtName: string): DistrictBoundaryMeta | null {
  return DISTRICT_BOUNDARIES[districtName] || null;
}
