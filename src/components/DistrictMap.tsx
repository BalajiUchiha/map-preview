"use client";

import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  Polyline,
  Tooltip,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import { District, Student, Volunteer } from "@/data/districts";
import { getDistrictBoundary } from "@/data/districtBoundaries";

// Haversine distance calculator in kilometers
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Green for closer (<= 5km), Red for farther (> 5km)
function getLineColor(dist: number): string {
  return dist <= 5.0 ? "#16A34A" : "#DC2626";
}

// Modern, Minimal CSS Student Marker
// Small, clean blue circular marker with a subtle white border (#2563EB)
// Alert students (> 1L / Own House) use vibrant alert red (#DC2626)
const createStudentDotIcon = (
  opted: string,
  isHighIncome: boolean,
  hasOwnHouse: boolean,
  isSelected: boolean,
  opacity: number
) => {
  const isAlert = isHighIncome || hasOwnHouse;
  const bg = isAlert ? "#DC2626" : "#2563EB";
  const size = isSelected ? 15 : 10;

  // Selected student: highlighted circle with distinctive dual-ring halo
  const boxShadow = isSelected
    ? "0 0 0 2px #FFFFFF, 0 0 0 4.5px #2563EB, 0 2px 6px rgba(0,0,0,0.35)"
    : "0 0 0 1.5px #FFFFFF, 0 0 0 2px rgba(17,24,39,0.35), 0 1px 3px rgba(0,0,0,0.25)";

  return L.divIcon({
    className: "modern-student-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${bg};
        border-radius: 50%;
        box-shadow: ${boxShadow};
        opacity: ${opacity};
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        cursor: pointer;
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Modern, Minimal CSS Volunteer Marker
// Green circular ring with dark outer border (#16A34A ring + #111 border)
const createVolunteerDotIcon = (isSelected: boolean, opacity: number) => {
  const size = isSelected ? 17 : 13;

  // Selected volunteer: distinctive outer halo/ring making selection unmistakable
  const boxShadow = isSelected
    ? "0 0 0 2.5px #FFFFFF, 0 0 0 5px #16A34A, 0 2px 8px rgba(0,0,0,0.4)"
    : "0 0 0 1px #111111, 0 1px 3px rgba(0,0,0,0.3)";

  return L.divIcon({
    className: "modern-volunteer-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: #FFFFFF;
        border: ${isSelected ? "3.5px" : "2.5px"} solid #16A34A;
        border-radius: 50%;
        box-shadow: ${boxShadow};
        opacity: ${opacity};
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: ${isSelected ? 4 : 3}px;
          height: ${isSelected ? 4 : 3}px;
          background: #111111;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createHqIcon = (opacity: number) =>
  L.divIcon({
    className: "hq-dot",
    html: `
      <div style="
        background: #FFC20E;
        border: 2px solid #111;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        display: grid;
        place-items: center;
        font-size: 11px;
        box-shadow: 2px 2px 0 #111;
        opacity: ${opacity};
        transform: translate(-50%, -50%);
        transition: opacity 0.25s ease;
        cursor: pointer;
      ">🏛️</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

// Map Controller for Zoom tracking, map clicks and auto-focus
function MapInteractionController({
  district,
  selectedStudent,
  selectedVolunteer,
  recenterTrigger,
  onZoomChange,
  onClearFocus,
}: {
  district: District;
  selectedStudent: Student | null;
  selectedVolunteer: Volunteer | null;
  recenterTrigger: number;
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

  // Tight urban bounds centered on the district populated area so it is never "far zoomed away"
  const { urbanBounds, maxBounds } = useMemo(() => {
    // 0.07 deg lat/lng span (~15km) closely wraps the populated city area with markers
    const tightSpan = 0.07;
    const uSw = L.latLng(district.lat - tightSpan, district.lng - tightSpan);
    const uNe = L.latLng(district.lat + tightSpan, district.lng + tightSpan);
    const uBounds = L.latLngBounds(uSw, uNe);

    if (boundary) {
      const mSw = L.latLng(boundary.maxBounds[0][0], boundary.maxBounds[0][1]);
      const mNe = L.latLng(boundary.maxBounds[1][0], boundary.maxBounds[1][1]);
      return {
        urbanBounds: uBounds,
        maxBounds: L.latLngBounds(mSw, mNe),
      };
    }
    const mSw = L.latLng(district.lat - 0.25, district.lng - 0.25);
    const mNe = L.latLng(district.lat + 0.25, district.lng + 0.25);
    return { urbanBounds: uBounds, maxBounds: L.latLngBounds(mSw, mNe) };
  }, [boundary, district]);

  // Handle window/container dynamic resize (split-screen drag, mobile orientation)
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  // Initial district lock & urban-focused boundaries
  useEffect(() => {
    map.invalidateSize();
    map.setMaxBounds(maxBounds);
    map.options.maxBoundsViscosity = 1.0;

    // Calculate optimal zoom tailored to container dimensions
    const fitZoom = map.getBoundsZoom(urbanBounds, false, L.point(16, 16));
    map.setMinZoom(Math.max(10, fitZoom - 0.8));

    map.fitBounds(urbanBounds, {
      padding: [16, 16],
      maxZoom: 13.5,
      animate: false,
    });
    onZoomChange(map.getZoom());
  }, [district, urbanBounds, maxBounds, map, onZoomChange]);

  // Dynamic zoom & focus controller
  useEffect(() => {
    // 1. Both Volunteer AND Student selected: smoothly fit BOTH in view
    if (selectedVolunteer && selectedStudent) {
      const pairBounds = L.latLngBounds(
        [selectedVolunteer.lat, selectedVolunteer.lng],
        [selectedStudent.lat, selectedStudent.lng]
      );
      map.flyToBounds(pairBounds, {
        padding: [65, 65],
        maxZoom: 15,
        duration: 0.6,
      });
      return;
    }

    // 2. Only Volunteer selected: zoom into volunteer location at close scale
    if (selectedVolunteer) {
      map.flyTo([selectedVolunteer.lat, selectedVolunteer.lng], 14.5, { duration: 0.6 });
      return;
    }

    // 3. Only Student selected: zoom into student location at close scale
    if (selectedStudent) {
      map.flyTo([selectedStudent.lat, selectedStudent.lng], 14.5, { duration: 0.6 });
      return;
    }

    // 4. Centerise view back to district urban bounds
    if (recenterTrigger > 0 || (!selectedStudent && !selectedVolunteer)) {
      map.flyToBounds(urbanBounds, { duration: 0.6, padding: [16, 16], maxZoom: 13.5 });
    }
  }, [selectedVolunteer, selectedStudent, recenterTrigger, urbanBounds, map]);

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
  const [isDimmed, setIsDimmed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showDefaultLines, setShowDefaultLines] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedVolunteer = useMemo(
    () => volunteers.find((v) => v.id === selectedVolunteerId) || null,
    [volunteers, selectedVolunteerId]
  );

  const districtBoundary = useMemo(() => getDistrictBoundary(district.name), [district.name]);

  // Administrative max bounds with 5km buffer
  const initialMaxBounds = useMemo(() => {
    if (districtBoundary) {
      const sw = L.latLng(districtBoundary.maxBounds[0][0], districtBoundary.maxBounds[0][1]);
      const ne = L.latLng(districtBoundary.maxBounds[1][0], districtBoundary.maxBounds[1][1]);
      return L.latLngBounds(sw, ne);
    }
    const sw = L.latLng(district.lat - 0.25, district.lng - 0.25);
    const ne = L.latLng(district.lat + 0.25, district.lng + 0.25);
    return L.latLngBounds(sw, ne);
  }, [district, districtBoundary]);

  // Students sorted by proximity to selected volunteer
  const studentsWithDistance = useMemo(() => {
    if (!selectedVolunteer) return [];
    return students
      .map((s) => ({
        student: s,
        dist: getDistanceKm(selectedVolunteer.lat, selectedVolunteer.lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [students, selectedVolunteer]);

  // Distance between selected volunteer and selected student (if both active)
  const pairDistanceKm = useMemo(() => {
    if (!selectedVolunteer || !selectedStudent) return null;
    return getDistanceKm(
      selectedVolunteer.lat,
      selectedVolunteer.lng,
      selectedStudent.lat,
      selectedStudent.lng
    );
  }, [selectedVolunteer, selectedStudent]);

  // STRICT Volunteer-to-Student Connection Lines
  // Connects volunteer to ONLY nearby students (<= 5km) or single direct pair line when a student is selected
  const activeConnections = useMemo(() => {
    // CASE 1: Both Volunteer AND Student selected -> Show ONLY the single direct line between them!
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
          volunteerId: selectedVolunteer.id,
          studentId: selectedStudent.id,
          from: [selectedVolunteer.lat, selectedVolunteer.lng] as [number, number],
          to: [selectedStudent.lat, selectedStudent.lng] as [number, number],
          dist,
          color: getLineColor(dist),
          isFocus: true,
          isSelectedPair: true,
        },
      ];
    }

    // CASE 2: Only Volunteer selected -> Show ONLY closest nearby students within 5 km (max 3)
    if (selectedVolunteer) {
      const nearby = students
        .map((s) => ({
          student: s,
          dist: getDistanceKm(selectedVolunteer.lat, selectedVolunteer.lng, s.lat, s.lng),
        }))
        .filter((item) => item.dist <= 5.0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);

      return nearby.map((item) => ({
        id: `focus-${selectedVolunteer.id}-${item.student.id}`,
        volunteerId: selectedVolunteer.id,
        studentId: item.student.id,
        from: [selectedVolunteer.lat, selectedVolunteer.lng] as [number, number],
        to: [item.student.lat, item.student.lng] as [number, number],
        dist: item.dist,
        color: "#16834A",
        isFocus: true,
        isSelectedPair: false,
      }));
    }

    if (!showDefaultLines) return [];

    // CASE 3: No volunteer selected -> show 1 closest line per volunteer (<= 5km)
    const lines: {
      id: string;
      volunteerId: string;
      studentId: string;
      from: [number, number];
      to: [number, number];
      dist: number;
      color: string;
      isFocus: boolean;
      isSelectedPair: boolean;
    }[] = [];

    volunteers.forEach((v) => {
      let closestStudent = students[0];
      let minDist = 9999;
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
          volunteerId: v.id,
          studentId: closestStudent.id,
          from: [v.lat, v.lng],
          to: [closestStudent.lat, closestStudent.lng],
          dist: minDist,
          color: "#16834A",
          isFocus: false,
          isSelectedPair: false,
        });
      }
    });

    return lines;
  }, [volunteers, students, selectedVolunteer, selectedStudent, showDefaultLines]);

  const markerOpacity = isDimmed ? 0.15 : 1.0;

  return (
    <div className="relative h-full w-full bg-[#f4f4f0] overflow-hidden select-none">
      {/* MODERN MINIMAL LEGEND BOX */}
      <div className="absolute top-3.5 right-3.5 z-[1000] bg-white/95 backdrop-blur-md border-[2px] border-black rounded-[8px] shadow-[3px_3px_0_#111] px-3.5 py-1.5 flex items-center gap-3 font-mono text-xs">
        <span className="font-black text-sm uppercase tracking-wider text-black">{district.name}</span>
        <div className="h-4 w-[2px] bg-black/20"></div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <div className="flex items-center gap-1.5" title="Student applicant">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shadow-[0_0_0_1.5px_#fff,0_0_0_2px_#111]"></span>
            <span>Students</span>
          </div>
          <div className="flex items-center gap-1.5" title="Volunteer verifier (green ring)">
            <span className="w-3 h-3 rounded-full bg-white border-[2.5px] border-[#16A34A] shadow-[0_0_0_1px_#111] flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-[#111]"></span>
            </span>
            <span>Volunteers</span>
          </div>
          <div className="flex items-center gap-1.5" title="Priority status: Income > 1L or Own House">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] shadow-[0_0_0_1.5px_#fff,0_0_0_2px_#111]"></span>
            <span>Alert</span>
          </div>
        </div>
      </div>

      {/* ACTIVE SELECTION BANNER (Shown when only volunteer is focused) */}
      {selectedVolunteer && !selectedStudent && (
        <div className="absolute top-3.5 left-12 z-[1000] bg-white border-2 border-black rounded-[6px] shadow-[3px_3px_0_#111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-2.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-black border border-[#FFC20E] shrink-0" />
            <span>🤝 Focused: {selectedVolunteer.name}</span>
            <span className="text-[10px] text-gray-500 font-normal">({selectedVolunteer.college})</span>
          </span>
          <button
            onClick={() => {
              onSelectVolunteer(null);
              setRecenterCount((c) => c + 1);
            }}
            className="px-2 py-0.5 bg-black text-[#FFC20E] rounded text-[10px] cursor-pointer hover:bg-gray-800 transition-colors"
          >
            Clear ✕
          </button>
        </div>
      )}

      {/* FLOATING STUDENT APPLICATION FORM DETAILS WINDOW (When a student is clicked) */}
      {selectedStudent && (
        <div
          className={`absolute top-3.5 left-12 z-[1001] w-[295px] max-w-[88vw] rounded-[4px] p-3 text-xs animate-in fade-in zoom-in-95 duration-150 ${
            selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes"
              ? "bg-[#FFE9E5] border-[3px] border-[#D92D20] shadow-[5px_5px_0px_#D92D20]"
              : "bg-white border-[3px] border-[#111111] shadow-[5px_5px_0px_#111111]"
          }`}
        >
          {/* Header */}
          <div className="flex justify-between items-start gap-1 pb-2 border-b-2 border-black/15">
            <div>
              <div className="font-sans font-black text-sm uppercase text-[#111] tracking-tight">
                {selectedStudent.name}
              </div>
              <div className="font-mono text-[9px] text-[#555] font-semibold">
                ID: {selectedStudent.id}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="badge-stream">{selectedStudent.opted}</span>
              <span className="badge-marks">{selectedStudent.marks}/600</span>
              <button
                onClick={() => onSelectStudent(null)}
                className="w-5 h-5 bg-black text-white hover:text-[#FFC20E] rounded-full flex items-center justify-center font-bold text-[10px] cursor-pointer"
                title="Close student form (volunteer stays active)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Distance Bar if connected to active volunteer */}
          {selectedVolunteer && pairDistanceKm !== null && (
            <div className="mt-2 p-1.5 bg-[#111] text-[#FFC20E] rounded font-mono text-[10px] flex items-center justify-between border border-black shadow-[1px_1px_0_#FFC20E]">
              <span className="truncate">🤝 Vol. {selectedVolunteer.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded font-black text-[9px] ${
                  pairDistanceKm <= 5.0 ? "bg-[#16834A] text-white" : "bg-[#D92D20] text-white"
                }`}
              >
                ⚡ {pairDistanceKm} km
              </span>
            </div>
          )}

          {/* Form Details 2x2 Grid */}
          <div className="mt-2.5 font-mono text-[11px] grid grid-cols-2 gap-2 bg-white/70 p-2 border border-black/20 rounded">
            <div>
              <span className="text-[#666] text-[9px] uppercase block">Gender</span>
              <b className="text-[#111]">{selectedStudent.gender}</b>
            </div>
            <div>
              <span className="text-[#666] text-[9px] uppercase block">Parents</span>
              <b className="text-[#111]">{selectedStudent.parents}</b>
            </div>
            <div>
              <span className="text-[#666] text-[9px] uppercase block">Own House</span>
              <b className={selectedStudent.ownHouse === "Yes" ? "text-[#D92D20]" : "text-green-700"}>
                {selectedStudent.ownHouse}
              </b>
            </div>
            <div>
              <span className="text-[#666] text-[9px] uppercase block">Family Income</span>
              {selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes" ? (
                <span className="income-red-tag text-[9px]">
                  ₹{selectedStudent.familyIncome.toLocaleString()}
                </span>
              ) : (
                <b className="text-green-700">₹{selectedStudent.familyIncome.toLocaleString()}</b>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM-RIGHT FAB: SINGLE CIRCLE REVEALING THREE STACKED CIRCLES */}
      <div className="absolute bottom-5 right-4 z-[1000] flex flex-col-reverse items-center gap-2.5">
        <button
          onClick={() => setFabOpen((prev) => !prev)}
          className={`w-12 h-12 rounded-full border-[2.5px] border-black shadow-[3px_3px_0_#111] flex items-center justify-center font-bold text-lg transition-transform cursor-pointer relative group ${
            fabOpen ? "bg-black text-[#FFC20E] rotate-45" : "bg-[#FFC20E] text-black hover:scale-105"
          }`}
          aria-label="Map Tools Menu"
        >
          <span>{fabOpen ? "＋" : "⚙️"}</span>

          <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-16 bg-black text-[#FFC20E] text-xs font-mono font-bold px-2.5 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap">
            {fabOpen ? "Close Tools" : "Map Controls"}
          </span>
        </button>

        {fabOpen && (
          <div className="flex flex-col items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="relative group">
              <button
                onClick={() => {
                  onSelectStudent(null);
                  onSelectVolunteer(null);
                  setRecenterCount((c) => c + 1);
                }}
                className="w-11 h-11 rounded-full bg-white hover:bg-[#FFC20E] text-black border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center text-base cursor-pointer hover:scale-105 transition-all"
                aria-label="Centerise view"
              >
                🎯
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-14 top-2 bg-black text-[#FFC20E] text-[11px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap">
                Centerise View
              </span>
            </div>

            <div className="relative group">
              <button
                onClick={() => setIsDimmed((prev) => !prev)}
                className={`w-11 h-11 rounded-full border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center text-base cursor-pointer hover:scale-105 transition-all ${
                  isDimmed ? "bg-[#D92D20] text-white" : "bg-white hover:bg-black hover:text-[#FFC20E] text-black"
                }`}
                aria-label="Toggle transparency"
              >
                {isDimmed ? "🕶️" : "👁️"}
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-14 top-2 bg-black text-[#FFC20E] text-[11px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap">
                {isDimmed ? "Restore Pins (100% Opacity)" : "Dim Pins (Hide / Ghost View)"}
              </span>
            </div>

            <div className="relative group">
              <button
                onClick={() => {
                  setShowDefaultLines((prev) => !prev);
                }}
                className={`w-11 h-11 rounded-full border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center text-base cursor-pointer hover:scale-105 transition-all ${
                  showDefaultLines ? "bg-[#DDF5E6] text-[#16834A]" : "bg-white text-black hover:bg-gray-100"
                }`}
                aria-label="Toggle distance lines"
              >
                ⚡
              </button>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-14 top-2 bg-black text-[#FFC20E] text-[11px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap">
                {showDefaultLines ? "Turn Lines Off" : "Show Distance Lines"}
              </span>
            </div>
          </div>
        )}
      </div>

      <MapContainer
        key={`map-container-${district.name}`}
        center={districtBoundary ? districtBoundary.urbanCenter : [district.lat, district.lng]}
        zoom={13}
        minZoom={10}
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
          selectedStudent={selectedStudent}
          selectedVolunteer={selectedVolunteer}
          recenterTrigger={recenterCount}
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

        {/* DISTRICT ADMINISTRATIVE BOUNDARY GEOJSON LAYER */}
        {districtBoundary && (
          <GeoJSON
            key={`boundary-layer-${district.name}`}
            data={districtBoundary as any}
            style={() => ({
              color: "#111111",
              weight: 2.5,
              dashArray: "4, 4",
              fillColor: "#FFC20E",
              fillOpacity: 0.05,
              lineCap: "round",
              lineJoin: "round",
            })}
          />
        )}

        {/* PROXIMITY CONNECTION LINES: STRICTLY VOLUNTEER TO STUDENT */}
        {activeConnections.map((conn) => {
          const midLat = (conn.from[0] + conn.to[0]) / 2;
          const midLng = (conn.from[1] + conn.to[1]) / 2;

          const isSelectedPair = conn.isSelectedPair;
          const lineWeight = isSelectedPair ? 5.5 : conn.isFocus ? 3.8 : 2.5;
          const lineOpacity = isDimmed
            ? 0.05
            : isSelectedPair
            ? 1.0
            : selectedStudent
            ? 0.45
            : 0.88;

          // Always show badge for the focused volunteer-student pair, or for closer connections
          const showBadge =
            isSelectedPair ||
            (!selectedStudent && (conn.dist <= 5.0 || currentZoom >= 13));

          return (
            <Polyline
              key={conn.id}
              positions={[conn.from, conn.to]}
              pathOptions={{
                color: isSelectedPair ? "#111111" : conn.color,
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
                      backgroundColor: isSelectedPair ? "#111111" : conn.color,
                      color: isSelectedPair ? "#FFD600" : "#FFFFFF",
                      padding: isSelectedPair ? "3px 7px" : "2px 5px",
                      borderRadius: "3px",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: isSelectedPair ? "11px" : "10px",
                      fontWeight: 900,
                      border: "2px solid #111",
                      boxShadow: isSelectedPair ? "3px 3px 0 #111" : "2px 2px 0 #111",
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

        {/* District HQ Landmark Icon */}
        <Marker position={[district.lat, district.lng]} icon={createHqIcon(markerOpacity)}>
          <Popup>
            <div className="p-1 font-sans text-xs">
              <div className="font-bold text-sm text-[#111]">{district.name} HQ</div>
              <div className="text-[11px] text-[#555] font-mono mt-0.5">
                Total Applicants: <b>{district.totalApplicants.toLocaleString()}</b>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* ALL STUDENTS RENDERED */}
        {students.map((student) => {
          const isHighIncome = student.familyIncome > 100000;
          const hasOwnHouse = student.ownHouse === "Yes";
          const isSelected = selectedStudentId === student.id;
          return (
            <Marker
              key={student.id}
              position={[student.lat, student.lng]}
              icon={createStudentDotIcon(
                student.opted,
                isHighIncome,
                hasOwnHouse,
                isSelected,
                markerOpacity
              )}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  // Toggle student without clearing active volunteer
                  onSelectStudent(isSelected ? null : student.id);
                },
              }}
            />
          );
        })}

        {/* ALL VOLUNTEERS RENDERED (No clipping popups above pins) */}
        {volunteers.map((vol) => {
          const isSelected = selectedVolunteerId === vol.id;
          return (
            <Marker
              key={vol.id}
              position={[vol.lat, vol.lng]}
              icon={createVolunteerDotIcon(isSelected, markerOpacity)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  // Toggle volunteer without clearing active student
                  onSelectVolunteer(isSelected ? null : vol.id);
                },
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
