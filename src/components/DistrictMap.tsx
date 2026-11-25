"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  Polyline,
  Tooltip,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import type { GeoJsonObject } from "geojson";
import { District, Student, Volunteer, getDistanceKm, getNearbyStudents } from "@/data/districts";
import { fetchDistrictGeoJson, getDistrictBoundary } from "@/data/districtBoundaries";

function getLineColor(dist: number): string {
  return dist <= 5.0 ? "#16A34A" : "#DC2626";
}

const iconCache = new Map<string, L.DivIcon>();

function getCachedIcon(key: string, create: () => L.DivIcon): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = create();
    iconCache.set(key, icon);
  }
  return icon;
}

type ZoomTier = "compact" | "medium" | "large";

const PROXIMITY_ZOOM_THRESHOLD = 13.0;

function getZoomTier(zoom: number): ZoomTier {
  if (zoom < 12.25) return "compact";
  if (zoom < 13.75) return "medium";
  return "large";
}

// Lightweight Neo-Brutalist SVG Markers:
// - Boy Student: #2563EB shirt on #EFF6FF tint
// - Girl Student: #EC4899 pink shirt on #FDF2F8 tint
// - Compact tier (< 12.25 zoom): small geometric pins to prevent clutter
const getStudentMarkerIcon = (
  gender: "Male" | "Female",
  isSelected: boolean,
  tier: ZoomTier,
  opacity: number
) =>
  getCachedIcon(`s-${gender}-${isSelected}-${tier}-${opacity}`, () => {
    const effectiveTier: ZoomTier = isSelected && tier === "compact" ? "medium" : tier;
    const isMale = gender === "Male";
    const accent = isMale ? "#2563EB" : "#EC4899";
    const cardBg = isMale ? "#EFF6FF" : "#FDF2F8";
    const hoverClass = isMale ? "neo-pin-boy" : "neo-pin-girl";

    if (effectiveTier === "compact") {
      const size = isSelected ? 15 : 11;
      const boxShadow = isSelected
        ? "0 0 0 2px #FFFFFF, 0 0 0 4px #000000, 0 0 0 6px #FFE600"
        : "0 0 0 1px #FFFFFF, 1.5px 1.5px 0 #000000";
      return L.divIcon({
        className: "neo-student-marker",
        html: `<div class="${hoverClass}" style="width:${size}px;height:${size}px;background:${accent};border:2px solid #000000;border-radius:50%;box-shadow:${boxShadow};opacity:${opacity};cursor:pointer;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    }

    const size = effectiveTier === "large" ? (isSelected ? 34 : 30) : isSelected ? 26 : 22;
    const boxShadow = isSelected
      ? "0 0 0 2px #FFFFFF, 0 0 0 4.5px #000000, 0 0 0 8px #FFE600"
      : "2px 2px 0 #000000";

    const personSvg = isMale
      ? `<svg viewBox="0 0 24 24" width="${size - 6}" height="${size - 6}" aria-hidden="true">
          <path d="M7.5 8.5c0-3 2-5 4.5-5s4.5 2 4.5 5v1H7.5z" fill="#111827"/>
          <circle cx="12" cy="10" r="3.6" fill="#FDE68A" stroke="#000000" stroke-width="1.6"/>
          <path d="M5.5 21c.6-3.8 3.1-5.8 6.5-5.8s5.9 2 6.5 5.8z" fill="${accent}" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>`
      : `<svg viewBox="0 0 24 24" width="${size - 6}" height="${size - 6}" aria-hidden="true">
          <path d="M6.5 13.5c-.5-5 1.5-9.5 5.5-9.5s6 4.5 5.5 9.5l-1.5 1H8z" fill="#111827"/>
          <circle cx="12" cy="10" r="3.5" fill="#FDE68A" stroke="#000000" stroke-width="1.6"/>
          <path d="M5.5 21c.6-3.8 3.1-5.8 6.5-5.8s5.9 2 6.5 5.8z" fill="${accent}" stroke="#000000" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>`;

    return L.divIcon({
      className: "neo-student-marker",
      html: `<div class="${hoverClass}" style="width:${size}px;height:${size}px;background:${cardBg};border:2px solid #000000;border-radius:3px;box-shadow:${boxShadow};opacity:${opacity};display:flex;align-items:center;justify-content:center;cursor:pointer;">${personSvg}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  });

// Volunteer 'V' Circle Marker: Yellow (#FFE600) pin + Black (#000000) 'V'
const getVolunteerMarkerIcon = (isSelected: boolean, tier: ZoomTier, opacity: number) =>
  getCachedIcon(`v-${isSelected}-${tier}-${opacity}`, () => {
    const effectiveTier: ZoomTier = isSelected && tier === "compact" ? "medium" : tier;

    if (effectiveTier === "compact") {
      const size = isSelected ? 17 : 13;
      const boxShadow = isSelected
        ? "0 0 0 2px #FFFFFF, 0 0 0 4px #000000, 0 0 0 6px #FFE600"
        : "1.5px 1.5px 0 #000000";
      return L.divIcon({
        className: "neo-volunteer-marker",
        html: `<div class="neo-pin-vol" style="width:${size}px;height:${size}px;background:#FFE600;border:2px solid #000000;border-radius:50%;box-shadow:${boxShadow};opacity:${opacity};display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:var(--mono);font-size:8px;font-weight:900;color:#000000;line-height:1;">V</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    }

    const size = effectiveTier === "large" ? (isSelected ? 34 : 30) : isSelected ? 26 : 22;
    const fontSize = effectiveTier === "large" ? 15 : 12;
    const boxShadow = isSelected
      ? "0 0 0 2px #FFFFFF, 0 0 0 4.5px #000000, 0 0 0 8px #FFE600"
      : "2px 2px 0 #000000";

    return L.divIcon({
      className: "neo-volunteer-marker",
      html: `<div class="neo-pin-vol" style="width:${size}px;height:${size}px;background:#FFE600;border:2px solid #000000;border-radius:50%;box-shadow:${boxShadow};opacity:${opacity};display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:var(--mono);font-size:${fontSize}px;font-weight:900;color:#000000;line-height:1;">V</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  });

function MapInteractionController({
  district,
  students,
  volunteers,
  selectedStudent,
  selectedVolunteer,
  recenterTrigger,
  fitPolygonTrigger,
  onZoomChange,
  onClearFocus,
}: {
  district: District;
  students: Student[];
  volunteers: Volunteer[];
  selectedStudent: Student | null;
  selectedVolunteer: Volunteer | null;
  recenterTrigger: number;
  fitPolygonTrigger: number;
  onZoomChange: (z: number) => void;
  onClearFocus: () => void;
}) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
    click() {
      onClearFocus();
    },
  });

  const boundary = useMemo(() => getDistrictBoundary(district.name), [district.name]);

  const { clusterBounds, polygonBounds, maxBounds } = useMemo(() => {
    const pts: L.LatLngExpression[] = [[district.lat, district.lng]];
    for (const s of students) pts.push([s.lat, s.lng]);
    for (const v of volunteers) pts.push([v.lat, v.lng]);
    const cBounds = L.latLngBounds(pts).pad(0.08);

    if (boundary) {
      return {
        clusterBounds: cBounds,
        polygonBounds: L.latLngBounds(boundary.urbanBounds[0], boundary.urbanBounds[1]),
        maxBounds: L.latLngBounds(boundary.maxBounds[0], boundary.maxBounds[1]),
      };
    }

    return {
      clusterBounds: cBounds,
      polygonBounds: L.latLngBounds(
        [district.lat - 0.08, district.lng - 0.08],
        [district.lat + 0.08, district.lng + 0.08]
      ),
      maxBounds: L.latLngBounds(
        [district.lat - 0.25, district.lng - 0.25],
        [district.lat + 0.25, district.lng + 0.25]
      ),
    };
  }, [boundary, district, students, volunteers]);

  // Keep Leaflet sized during window resize and split-pane dragging
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  // Lock panning to district polygon + 5km buffer, and frame populated cluster tightly (fixes Ariyalur zoom)
  useEffect(() => {
    map.invalidateSize();
    map.setMaxBounds(maxBounds);

    const polyZoom = map.getBoundsZoom(polygonBounds, false, L.point(16, 16));
    map.setMinZoom(Math.max(8, polyZoom - 0.5));

    map.fitBounds(clusterBounds, {
      padding: [36, 36],
      maxZoom: 13.5,
      animate: false,
    });
    onZoomChange(map.getZoom());
  }, [district, clusterBounds, polygonBounds, maxBounds, map, onZoomChange]);

  const prevHadSelectionRef = useRef(false);
  const prevRecenterRef = useRef(recenterTrigger);
  const prevPolygonTriggerRef = useRef(fitPolygonTrigger);

  // Dynamic zoom & focus controller
  useEffect(() => {
    const hasSelection = Boolean(selectedVolunteer || selectedStudent);
    const shouldRecenterCluster = recenterTrigger !== prevRecenterRef.current;
    const shouldFitPolygon = fitPolygonTrigger !== prevPolygonTriggerRef.current;
    prevRecenterRef.current = recenterTrigger;
    prevPolygonTriggerRef.current = fitPolygonTrigger;

    if (shouldFitPolygon) {
      prevHadSelectionRef.current = false;
      map.flyToBounds(polygonBounds, { duration: 0.6, padding: [20, 20], maxZoom: 13 });
      return;
    }

    if (selectedVolunteer && selectedStudent) {
      prevHadSelectionRef.current = true;
      const pairBounds = L.latLngBounds(
        [selectedVolunteer.lat, selectedVolunteer.lng],
        [selectedStudent.lat, selectedStudent.lng]
      );
      map.flyToBounds(pairBounds, { padding: [65, 65], maxZoom: 15, duration: 0.6 });
      return;
    }

    if (selectedVolunteer) {
      prevHadSelectionRef.current = true;
      map.flyTo([selectedVolunteer.lat, selectedVolunteer.lng], 14.5, { duration: 0.6 });
      return;
    }

    if (selectedStudent) {
      prevHadSelectionRef.current = true;
      map.flyTo([selectedStudent.lat, selectedStudent.lng], 14.5, { duration: 0.6 });
      return;
    }

    if (shouldRecenterCluster || (!hasSelection && prevHadSelectionRef.current)) {
      map.flyToBounds(clusterBounds, { duration: 0.6, padding: [36, 36], maxZoom: 13.5 });
    }
    prevHadSelectionRef.current = false;
  }, [
    selectedVolunteer,
    selectedStudent,
    recenterTrigger,
    fitPolygonTrigger,
    clusterBounds,
    polygonBounds,
    map,
  ]);

  return null;
}

interface DistrictMapProps {
  district: District;
  students: Student[];
  volunteers: Volunteer[];
  selectedStudentId: string | null;
  selectedVolunteerId: string | null;
  onSelectStudent: (id: string | null) => void;
  onSelectVolunteer: (id: string | null) => void;
}

export default function DistrictMap({
  district,
  students,
  volunteers,
  selectedStudentId,
  selectedVolunteerId,
  onSelectStudent,
  onSelectVolunteer,
}: DistrictMapProps) {
  const [recenterCount, setRecenterCount] = useState(0);
  const [fitPolygonCount, setFitPolygonCount] = useState(0);
  const [isDimmed, setIsDimmed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showDefaultLines, setShowDefaultLines] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [loadedBoundary, setLoadedBoundary] = useState<{
    name: string;
    data: GeoJsonObject | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDistrictGeoJson(district.name, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setLoadedBoundary({ name: district.name, data });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [district.name]);

  const districtGeoJson = loadedBoundary?.name === district.name ? loadedBoundary.data : null;

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedVolunteer = useMemo(
    () => volunteers.find((v) => v.id === selectedVolunteerId) || null,
    [volunteers, selectedVolunteerId]
  );

  const districtBoundary = useMemo(() => getDistrictBoundary(district.name), [district.name]);

  const initialMaxBounds = useMemo(() => {
    if (districtBoundary) {
      return L.latLngBounds(districtBoundary.maxBounds[0], districtBoundary.maxBounds[1]);
    }
    return L.latLngBounds(
      [district.lat - 0.25, district.lng - 0.25],
      [district.lat + 0.25, district.lng + 0.25]
    );
  }, [district, districtBoundary]);

  const pairDistanceKm = useMemo(() => {
    if (!selectedVolunteer || !selectedStudent) return null;
    return getDistanceKm(
      selectedVolunteer.lat,
      selectedVolunteer.lng,
      selectedStudent.lat,
      selectedStudent.lng
    );
  }, [selectedVolunteer, selectedStudent]);

  // Strict Volunteer-to-Student connection lines
  const activeConnections = useMemo(() => {
    if (selectedVolunteer && selectedStudent) {
      const dist = getDistanceKm(
        selectedVolunteer.lat,
        selectedVolunteer.lng,
        selectedStudent.lat,
        selectedStudent.lng
      );
      return [
        {
          id: `pair-${selectedVolunteer.id}-${selectedStudent.id}`,
          from: [selectedVolunteer.lat, selectedVolunteer.lng] as [number, number],
          to: [selectedStudent.lat, selectedStudent.lng] as [number, number],
          dist,
          color: getLineColor(dist),
          isFocus: true,
          isSelectedPair: true,
        },
      ];
    }

    if (selectedVolunteer) {
      const { withinRadius } = getNearbyStudents(selectedVolunteer, students);
      return withinRadius.slice(0, 3).map((item) => ({
        id: `focus-${selectedVolunteer.id}-${item.student.id}`,
        from: [selectedVolunteer.lat, selectedVolunteer.lng] as [number, number],
        to: [item.student.lat, item.student.lng] as [number, number],
        dist: item.dist,
        color: "#16A34A",
        isFocus: true,
        isSelectedPair: false,
      }));
    }

    if (!showDefaultLines) return [];

    const lines: {
      id: string;
      from: [number, number];
      to: [number, number];
      dist: number;
      color: string;
      isFocus: boolean;
      isSelectedPair: boolean;
    }[] = [];

    volunteers.forEach((v) => {
      let closestStudent = students[0];
      let minDist = Infinity;
      students.forEach((s) => {
        const d = getDistanceKm(v.lat, v.lng, s.lat, s.lng);
        if (d < minDist) {
          minDist = d;
          closestStudent = s;
        }
      });

      if (closestStudent && minDist <= 5.0) {
        lines.push({
          id: `def-${v.id}-${closestStudent.id}`,
          from: [v.lat, v.lng],
          to: [closestStudent.lat, closestStudent.lng],
          dist: minDist,
          color: "#16A34A",
          isFocus: false,
          isSelectedPair: false,
        });
      }
    });

    return lines;
  }, [volunteers, students, selectedVolunteer, selectedStudent, showDefaultLines]);

  const markerOpacity = isDimmed ? 0.15 : 1.0;
  const zoomTier = getZoomTier(currentZoom);
  const showProximityLines =
    currentZoom >= PROXIMITY_ZOOM_THRESHOLD || Boolean(selectedVolunteer && selectedStudent);

  return (
    <div className="relative h-full w-full bg-[#FAF9F6] overflow-hidden select-none">
      {/* NEO-BRUTALIST LEGEND BOX (Top-right, compact on narrow splits) */}
      <div className="absolute top-3.5 right-3.5 z-[1000] bg-white border-2 border-black rounded-[2px] shadow-[3px_3px_0_#000] px-2.5 sm:px-3.5 py-1.5 flex items-center gap-2 sm:gap-3 font-mono text-xs max-w-[calc(100%-64px)]">
        <span className="font-heading font-bold text-xs sm:text-sm uppercase tracking-wider text-black truncate">
          {district.name}
        </span>
        <div className="h-4 w-[1.5px] bg-black shrink-0" />
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-bold shrink-0">
          <div className="flex items-center gap-1" title="Boy Applicant">
            <span className="w-3 h-3 rounded-[2px] bg-[#2563EB] border-[1.5px] border-black shadow-[1px_1px_0_#000]" />
            <span className="hidden sm:inline">Boy</span>
          </div>
          <div className="flex items-center gap-1" title="Girl Applicant">
            <span className="w-3 h-3 rounded-[2px] bg-[#EC4899] border-[1.5px] border-black shadow-[1px_1px_0_#000]" />
            <span className="hidden sm:inline">Girl</span>
          </div>
          <div className="flex items-center gap-1" title="Volunteer">
            <span className="w-4 h-4 rounded-full bg-[#FFE600] border-[1.5px] border-black shadow-[1px_1px_0_#000] flex items-center justify-center font-mono text-[9px] font-black text-black leading-none">
              V
            </span>
            <span className="hidden sm:inline">Volunteer</span>
          </div>
        </div>
      </div>

      {/* NON-OVERLAPPING FLOATING STUDENT INSPECTOR CARD (Bottom-left) */}
      {selectedStudent && (
        <div
          className={`absolute bottom-4 left-3.5 z-[1001] w-[295px] max-w-[calc(100%-82px)] rounded-[2px] p-3 text-xs select-text ${
            selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes"
              ? "bg-[#FFE9E5] border-2 border-[#DC2626] shadow-[5px_5px_0px_#DC2626]"
              : "bg-white border-2 border-black shadow-[5px_5px_0px_#000]"
          }`}
        >
          <div className="flex justify-between items-start gap-2 pb-2 border-b-[1.5px] border-black">
            <div className="min-w-0">
              <div className="font-heading font-bold text-sm uppercase text-black tracking-tight truncate">
                {selectedStudent.name}
              </div>
              <div className="font-mono text-[10px] text-black/60 font-medium">
                ID: {selectedStudent.id}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="badge-stream">{selectedStudent.opted}</span>
              <span className="badge-marks tabular-nums">{selectedStudent.marks}/600</span>
              <button
                type="button"
                onClick={() => onSelectStudent(null)}
                className="w-5 h-5 bg-black text-[#FFE600] hover:bg-neutral-800 rounded-[2px] flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Close student details (volunteer stays selected)"
                aria-label="Close student details"
              >
                ✕
              </button>
            </div>
          </div>

          {selectedVolunteer && pairDistanceKm !== null && (
            <div className="mt-2 px-2 py-1.5 bg-black text-[#FFE600] rounded-[2px] font-mono text-[10px] flex items-center justify-between gap-2">
              <span className="truncate font-bold">
                {selectedVolunteer.name.startsWith("Vol.") ? selectedVolunteer.name : `Vol. ${selectedVolunteer.name}`}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-[2px] font-bold text-[10px] tabular-nums shrink-0 border border-black ${
                  pairDistanceKm <= 5.0 ? "bg-[#4ADE80] text-black" : "bg-[#DC2626] text-white"
                }`}
              >
                {pairDistanceKm} km
              </span>
            </div>
          )}

          {/* Flat 1.5px grid inside card */}
          <div className="mt-2.5 font-mono text-[11px] grid grid-cols-2 border-[1.5px] border-black bg-white divide-x-[1.5px] divide-y-[1.5px] divide-black">
            <div className="p-1.5">
              <span className="text-black/60 text-[9px] uppercase block">Gender</span>
              <b className="text-black">{selectedStudent.gender}</b>
            </div>
            <div className="p-1.5">
              <span className="text-black/60 text-[9px] uppercase block">Parents</span>
              <b className="text-black">{selectedStudent.parents}</b>
            </div>
            <div className="p-1.5">
              <span className="text-black/60 text-[9px] uppercase block">Own House</span>
              <b className={selectedStudent.ownHouse === "Yes" ? "text-[#DC2626]" : "text-[#14532D]"}>
                {selectedStudent.ownHouse}
              </b>
            </div>
            <div className="p-1.5">
              <span className="text-black/60 text-[9px] uppercase block">Income</span>
              {selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes" ? (
                <span className="income-red-tag tabular-nums">
                  ₹{selectedStudent.familyIncome.toLocaleString()}
                </span>
              ) : (
                <b className="text-[#14532D] tabular-nums">
                  ₹{selectedStudent.familyIncome.toLocaleString()}
                </b>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM-RIGHT MAP TOOLBAR (Monochrome SVGs, no emojis) */}
      <div className="absolute bottom-5 right-4 z-[1000] flex flex-col-reverse items-center gap-2">
        <button
          type="button"
          onClick={() => setFabOpen((prev) => !prev)}
          className={`w-11 h-11 rounded-[2px] border-2 border-black shadow-[3px_3px_0_#000] flex items-center justify-center transition-transform cursor-pointer relative group ${
            fabOpen ? "bg-black text-[#FFE600]" : "bg-[#FFE600] text-black hover:-translate-x-0.5 hover:-translate-y-0.5"
          }`}
          aria-label="Map Tools Menu"
        >
          {fabOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          )}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-14 bg-black text-[#FFE600] text-[11px] font-mono font-bold px-2.5 py-1 rounded-[2px] border border-black whitespace-nowrap">
            {fabOpen ? "Close Tools" : "Map Controls"}
          </span>
        </button>

        {fabOpen && (
          <div className="flex flex-col items-center gap-2">
            {/* Focus active cluster (tight zoom) */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  onSelectStudent(null);
                  onSelectVolunteer(null);
                  setRecenterCount((c) => c + 1);
                }}
                className="w-10 h-10 rounded-[2px] bg-white hover:bg-[#FFE600] text-black border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Zoom to active cluster"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFE600] text-[10px] font-mono font-bold px-2 py-1 rounded-[2px] whitespace-nowrap">
                Focus Active Cluster
              </span>
            </div>

            {/* Fit full district boundary polygon */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  onSelectStudent(null);
                  onSelectVolunteer(null);
                  setFitPolygonCount((c) => c + 1);
                }}
                className="w-10 h-10 rounded-[2px] bg-white hover:bg-[#FFE600] text-black border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="View full district boundary"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFE600] text-[10px] font-mono font-bold px-2 py-1 rounded-[2px] whitespace-nowrap">
                Full District Bounds
              </span>
            </div>

            {/* Dim markers toggle */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setIsDimmed((prev) => !prev)}
                className={`w-10 h-10 rounded-[2px] border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center cursor-pointer transition-colors ${
                  isDimmed ? "bg-[#DC2626] text-white" : "bg-white hover:bg-black hover:text-[#FFE600] text-black"
                }`}
                aria-label="Toggle pin dimming"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFE600] text-[10px] font-mono font-bold px-2 py-1 rounded-[2px] whitespace-nowrap">
                {isDimmed ? "Restore Pins" : "Ghost Pins"}
              </span>
            </div>

            {/* Toggle default proximity lines */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setShowDefaultLines((prev) => !prev)}
                className={`w-10 h-10 rounded-[2px] border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center cursor-pointer transition-colors ${
                  showDefaultLines ? "bg-[#4ADE80] text-black" : "bg-white text-black hover:bg-[#FAF9F6]"
                }`}
                aria-label="Toggle distance lines"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="6" r="3" />
                  <path d="M8.5 15.5 15.5 8.5" />
                </svg>
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFE600] text-[10px] font-mono font-bold px-2 py-1 rounded-[2px] whitespace-nowrap">
                {showDefaultLines ? "Hide Lines" : "Show Lines"}
              </span>
            </div>
          </div>
        )}
      </div>

      <MapContainer
        key={`map-container-${district.name}`}
        center={[district.lat, district.lng]}
        zoom={13}
        minZoom={8}
        maxZoom={16}
        maxBounds={initialMaxBounds}
        maxBoundsViscosity={1.0}
        wheelPxPerZoomLevel={160}
        wheelDebounceTime={80}
        zoomSnap={0.25}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <MapInteractionController
          district={district}
          students={students}
          volunteers={volunteers}
          selectedStudent={selectedStudent}
          selectedVolunteer={selectedVolunteer}
          recenterTrigger={recenterCount}
          fitPolygonTrigger={fitPolygonCount}
          onZoomChange={setCurrentZoom}
          onClearFocus={() => {
            onSelectStudent(null);
            onSelectVolunteer(null);
          }}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {districtGeoJson && (
          <GeoJSON
            key={`boundary-layer-${district.name}`}
            data={districtGeoJson}
            style={() => ({
              color: "#000000",
              weight: 2.5,
              dashArray: "5, 5",
              fillColor: "#FFE600",
              fillOpacity: 0.06,
              lineCap: "round",
              lineJoin: "round",
            })}
          />
        )}

        {showProximityLines &&
          activeConnections.map((conn) => {
            const midLat = (conn.from[0] + conn.to[0]) / 2;
            const midLng = (conn.from[1] + conn.to[1]) / 2;

            const isSelectedPair = conn.isSelectedPair;
            const lineWeight = isSelectedPair ? 5 : conn.isFocus ? 3.5 : 2.5;
            const lineOpacity = isDimmed
              ? 0.05
              : isSelectedPair
              ? 1.0
              : selectedStudent
              ? 0.4
              : 0.88;

            const showBadge =
              isSelectedPair ||
              (!selectedStudent && (conn.dist <= 5.0 || currentZoom >= 13));

            return (
              <Polyline
                key={conn.id}
                positions={[conn.from, conn.to]}
                pathOptions={{
                  color: isSelectedPair ? "#000000" : conn.color,
                  weight: lineWeight,
                  opacity: lineOpacity,
                }}
              >
                {!isDimmed && showBadge && (
                  <Tooltip
                    position={[midLat, midLng]}
                    permanent={true}
                    direction="center"
                    className="distance-badge"
                  >
                    <span
                      style={{
                        backgroundColor: isSelectedPair ? "#000000" : conn.color,
                        color: isSelectedPair ? "#FFE600" : "#FFFFFF",
                        padding: isSelectedPair ? "3px 7px" : "2px 5px",
                        borderRadius: "2px",
                        fontFamily: "var(--mono)",
                        fontSize: isSelectedPair ? "11px" : "10px",
                        fontWeight: 700,
                        border: "1.5px solid #000000",
                        boxShadow: "2px 2px 0 #000000",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {conn.dist} km
                    </span>
                  </Tooltip>
                )}
              </Polyline>
            );
          })}

        {students.map((student) => {
          const isSelected = selectedStudentId === student.id;
          const pillBg = student.gender === "Male" ? "#2563EB" : "#EC4899";
          return (
            <Marker
              key={student.id}
              position={[student.lat, student.lng]}
              icon={getStudentMarkerIcon(
                student.gender,
                isSelected,
                zoomTier,
                markerOpacity
              )}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelectStudent(isSelected ? null : student.id);
                },
              }}
            >
              {isSelected && (
                <Tooltip
                  direction="top"
                  offset={[0, -16]}
                  permanent={true}
                  className="distance-badge"
                >
                  <span
                    style={{
                      backgroundColor: pillBg,
                      color: "#FFFFFF",
                      padding: "2px 7px",
                      borderRadius: "2px",
                      fontFamily: "var(--mono)",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "2px solid #000000",
                      boxShadow: "2px 2px 0 #000000",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {student.name}
                  </span>
                </Tooltip>
              )}
            </Marker>
          );
        })}

        {volunteers.map((vol) => {
          const isSelected = selectedVolunteerId === vol.id;
          return (
            <Marker
              key={vol.id}
              position={[vol.lat, vol.lng]}
              icon={getVolunteerMarkerIcon(isSelected, zoomTier, markerOpacity)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelectVolunteer(isSelected ? null : vol.id);
                },
              }}
            >
              {isSelected && (
                <Tooltip
                  direction="top"
                  offset={[0, -16]}
                  permanent={true}
                  className="distance-badge"
                >
                  <span
                    style={{
                      backgroundColor: "#FFE600",
                      color: "#000000",
                      padding: "2px 7px",
                      borderRadius: "2px",
                      fontFamily: "var(--mono)",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "2px solid #000000",
                      boxShadow: "2px 2px 0 #000000",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {vol.name}
                  </span>
                </Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
