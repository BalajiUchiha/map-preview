"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  Polyline,
  Tooltip,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import { District, Student, Volunteer } from "@/data/districts";
import { getDistrictBoundary } from "@/data/districtBoundaries";

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────
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
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function getLineColor(dist: number): string {
  return dist <= 5.0 ? "#16834A" : "#D92D20";
}

// ─────────────────────────────────────────────
// Icons  –  all sizes tightened to avoid pile-ups
// ─────────────────────────────────────────────
const createStudentDotIcon = (
  opted: string,
  isHighIncome: boolean,
  hasOwnHouse: boolean,
  isSelected: boolean,
  opacity: number,
  isNearVolunteer: boolean
) => {
  const isRedEntity = isHighIncome || hasOwnHouse;
  const bg = isRedEntity ? "#D92D20" : opted === "Eng" ? "#2457C5" : "#B85A12";
  const ring = isSelected ? "#FFD600" : isNearVolunteer ? "#FFC20E" : isRedEntity ? "#912018" : "#111111";
  // Smaller base size (14 → 18 for selected), reduces visual clutter
  const size = isSelected ? 20 : isNearVolunteer ? 17 : 14;
  const dotSize = isSelected ? 6 : isNearVolunteer ? 5 : 4;
  const borderW = isSelected ? "3px" : "2px";
  const shadow = isSelected
    ? "0 0 0 2px #111, 2px 2px 0 #111"
    : isNearVolunteer
    ? "0 0 0 1.5px #FFC20E, 1.5px 1.5px 0 #111"
    : "1.5px 1.5px 0 #111";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${bg};
      border:${borderW} solid ${ring};
      border-radius:50%;
      box-shadow:${shadow};
      opacity:${opacity};
      transform:translate(-50%,-50%);
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
      transition:all 0.15s ease;
    "><div style="width:${dotSize}px;height:${dotSize}px;background:#fff;border-radius:50%;"></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createVolunteerDotIcon = (isSelected: boolean, opacity: number) => {
  // Diamond  –  trimmed to 18/14 (was 26/21)
  const size = isSelected ? 20 : 15;
  const dotSize = isSelected ? 7 : 5;
  const border = isSelected ? "3px" : "2px";
  const glow = isSelected
    ? "0 0 0 2px #FFC20E, 2px 2px 0 #111"
    : "1.5px 1.5px 0 #111";

  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:#111111;
      border:${border} solid #FFC20E;
      border-radius:3px;
      box-shadow:${glow};
      display:flex;align-items:center;justify-content:center;
      opacity:${opacity};
      transform:translate(-50%,-50%) rotate(45deg);
      cursor:pointer;
      transition:all 0.15s ease;
    "><div style="width:${dotSize}px;height:${dotSize}px;background:#FFC20E;border-radius:50%;"></div></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createHqIcon = (opacity: number) =>
  L.divIcon({
    className: "",
    html: `<div style="
      background:#FFC20E;border:2px solid #111;border-radius:50%;
      width:24px;height:24px;display:grid;place-items:center;
      font-size:12px;box-shadow:2px 2px 0 #111;opacity:${opacity};
      transform:translate(-50%,-50%);transition:opacity 0.25s ease;cursor:pointer;
    ">🏛️</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

// ─────────────────────────────────────────────
// Map interaction controller
// ─────────────────────────────────────────────
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

  const { urbanBounds, maxBounds } = useMemo(() => {
    if (boundary) {
      const uSw = L.latLng(boundary.urbanBounds[0][0], boundary.urbanBounds[0][1]);
      const uNe = L.latLng(boundary.urbanBounds[1][0], boundary.urbanBounds[1][1]);
      const mSw = L.latLng(boundary.maxBounds[0][0], boundary.maxBounds[0][1]);
      const mNe = L.latLng(boundary.maxBounds[1][0], boundary.maxBounds[1][1]);
      return {
        urbanBounds: L.latLngBounds(uSw, uNe),
        maxBounds: L.latLngBounds(mSw, mNe),
      };
    }
    const sw = L.latLng(district.lat - 0.12, district.lng - 0.12);
    const ne = L.latLng(district.lat + 0.12, district.lng + 0.12);
    const b = L.latLngBounds(sw, ne);
    return { urbanBounds: b, maxBounds: b };
  }, [boundary, district]);

  useEffect(() => {
    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);

  // Initial district zoom + lock
  useEffect(() => {
    map.invalidateSize();
    map.setMaxBounds(maxBounds);
    map.options.maxBoundsViscosity = 1.0;
    const fitZoom = map.getBoundsZoom(urbanBounds, false, L.point(16, 16));
    map.setMinZoom(Math.max(10, fitZoom - 0.6));
    map.fitBounds(urbanBounds, { padding: [16, 16], maxZoom: 14, animate: false });
    onZoomChange(map.getZoom());
  }, [district, urbanBounds, maxBounds, map, onZoomChange]);

  // Fly to selected student
  useEffect(() => {
    if (selectedStudent) {
      map.flyTo([selectedStudent.lat, selectedStudent.lng], 14, { duration: 0.55 });
    }
  }, [selectedStudent, map]);

  // Fly to selected volunteer – fit volunteer + 4 nearest students in view
  useEffect(() => {
    if (selectedVolunteer) {
      map.flyTo([selectedVolunteer.lat, selectedVolunteer.lng], 13.5, { duration: 0.55 });
    }
  }, [selectedVolunteer, map]);

  // Recenter
  useEffect(() => {
    if (recenterTrigger > 0 || (!selectedStudent && !selectedVolunteer)) {
      map.flyToBounds(urbanBounds, { duration: 0.55, padding: [16, 16], maxZoom: 14 });
    }
  }, [recenterTrigger, selectedStudent, selectedVolunteer, urbanBounds, map]);

  return null;
}

// ─────────────────────────────────────────────
// Volunteer Info Panel (floating, draggable)
// ─────────────────────────────────────────────
interface VolunteerPanelStudent {
  student: Student;
  dist: number;
}

function VolunteerInfoPanel({
  volunteer,
  nearbyStudents,
  allStudents,
  onSelectStudent,
  onClose,
}: {
  volunteer: Volunteer;
  nearbyStudents: VolunteerPanelStudent[];
  allStudents: VolunteerPanelStudent[];
  onSelectStudent: (id: string | null) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"nearest" | "all">("nearest");
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 72 }); // bottom-left offset from container
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const rows = tab === "nearest" ? nearbyStudents : allStudents.slice(0, 12);

  // ── Drag logic (pointer events so it works on touch too) ──
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, .no-drag")) return;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setIsDragging(true);
    panelRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  };

  const handlePointerUp = () => {
    dragStart.current = null;
    setIsDragging(false);
  };

  return (
    <div
      ref={panelRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 1500,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        width: 260,
      }}
      className="select-none"
    >
      {/* Panel card */}
      <div
        className="bg-white border-[2.5px] border-black rounded-[6px] shadow-[4px_4px_0_#111] overflow-hidden font-mono"
        style={{ maxHeight: 420, display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="bg-[#111] px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                background: "#FFC20E",
                border: "1.5px solid #FFC20E",
                borderRadius: 2,
                transform: "rotate(45deg)",
                flexShrink: 0,
              }}
            />
            <span className="text-[#FFC20E] font-black text-xs uppercase tracking-wide truncate">
              {volunteer.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="no-drag text-[#FFC20E]/70 hover:text-[#FFC20E] text-sm leading-none flex-shrink-0 cursor-pointer"
            style={{ lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Volunteer stats */}
        <div className="px-3 py-2 border-b-[2px] border-black bg-[#FFFDE8]">
          <div className="text-[10px] text-[#555] truncate mb-1">🎓 {volunteer.college}</div>
          <div className="flex gap-3 text-[10px] font-bold text-[#111]">
            <span>PV Done: <b>{volunteer.pvCount}</b></span>
            <span>Assigned: <b>{volunteer.pvAssigned}</b></span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b-[2px] border-black no-drag">
          <button
            onClick={() => setTab("nearest")}
            className={`flex-1 text-[10px] font-black uppercase py-1.5 cursor-pointer transition-colors ${
              tab === "nearest"
                ? "bg-[#FFD600] text-black border-r-[2px] border-black"
                : "bg-white text-[#555] border-r-[2px] border-black hover:bg-yellow-50"
            }`}
          >
            Nearest ({nearbyStudents.length})
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex-1 text-[10px] font-black uppercase py-1.5 cursor-pointer transition-colors ${
              tab === "all"
                ? "bg-[#FFD600] text-black"
                : "bg-white text-[#555] hover:bg-yellow-50"
            }`}
          >
            All Students
          </button>
        </div>

        {/* Student rows */}
        <div className="overflow-y-auto flex-1 no-drag" style={{ scrollbarWidth: "thin" }}>
          {rows.length === 0 && (
            <div className="p-3 text-center text-[10px] text-[#888]">No students in range</div>
          )}
          {rows.map(({ student, dist }) => {
            const isHigh = student.familyIncome > 100000 || student.ownHouse === "Yes";
            const lineColor = getLineColor(dist);
            return (
              <button
                key={student.id}
                onClick={() => onSelectStudent(student.id)}
                className={`w-full text-left px-3 py-2 border-b border-black/10 hover:bg-[#FFF9DF] transition-colors cursor-pointer no-drag ${
                  isHigh ? "border-l-2 border-l-[#D92D20]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-[11px] font-black text-[#111] truncate"
                    style={{ maxWidth: 130 }}
                  >
                    {student.name}
                  </span>
                  <span
                    style={{
                      background: lineColor,
                      color: "#fff",
                      borderRadius: 3,
                      padding: "1px 5px",
                      fontSize: 9,
                      fontWeight: 900,
                      border: "1px solid #111",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {dist} km
                  </span>
                </div>
                <div className="flex gap-2 mt-0.5 text-[9px] text-[#666]">
                  <span
                    style={{
                      background: student.opted === "Eng" ? "#2457C5" : "#B85A12",
                      color: "#fff",
                      borderRadius: 2,
                      padding: "0 4px",
                      fontWeight: 700,
                      fontSize: 8,
                    }}
                  >
                    {student.opted}
                  </span>
                  <span>{student.gender}</span>
                  <span>· {student.marks}/600</span>
                  {isHigh && (
                    <span style={{ color: "#D92D20", fontWeight: 900 }}>⚠ High</span>
                  )}
                </div>
              </button>
            );
          })}
          {tab === "all" && allStudents.length > 12 && (
            <div className="px-3 py-1.5 text-[9px] text-[#888] text-center">
              Showing top 12 of {allStudents.length}
            </div>
          )}
        </div>

        {/* Drag hint */}
        <div className="px-3 py-1 bg-[#f4f4f0] border-t border-black/10 text-[8px] text-[#999] text-center">
          drag to reposition · click student to focus
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface DistrictMapProps {
  district: District;
  students: Student[];
  volunteers: Volunteer[];
  selectedStudentId: string | null;
  selectedVolunteerId: string | null;
  onSelectStudent: (id: string | null) => void;
  onSelectVolunteer: (id: string | null) => void;
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
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
  const [currentZoom, setCurrentZoom] = useState(12);
  const [panelVisible, setPanelVisible] = useState(false);

  // Show panel when a volunteer is selected
  useEffect(() => {
    if (selectedVolunteerId) {
      setPanelVisible(true);
    } else {
      setPanelVisible(false);
    }
  }, [selectedVolunteerId]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedVolunteer = useMemo(
    () => volunteers.find((v) => v.id === selectedVolunteerId) || null,
    [volunteers, selectedVolunteerId]
  );

  const districtBoundary = useMemo(
    () => getDistrictBoundary(district.name),
    [district.name]
  );

  const initialMaxBounds = useMemo(() => {
    if (districtBoundary) {
      const sw = L.latLng(districtBoundary.maxBounds[0][0], districtBoundary.maxBounds[0][1]);
      const ne = L.latLng(districtBoundary.maxBounds[1][0], districtBoundary.maxBounds[1][1]);
      return L.latLngBounds(sw, ne);
    }
    const sw = L.latLng(district.lat - 0.12, district.lng - 0.12);
    const ne = L.latLng(district.lat + 0.12, district.lng + 0.12);
    return L.latLngBounds(sw, ne);
  }, [district, districtBoundary]);

  // ── Sorted student distances from selected volunteer ──────────────────────
  const volunteerStudentDistances = useMemo(() => {
    if (!selectedVolunteer) return [];
    return students
      .map((s) => ({
        student: s,
        dist: getDistanceKm(selectedVolunteer.lat, selectedVolunteer.lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.dist - b.dist);
  }, [selectedVolunteer, students]);

  const nearestStudents = useMemo(
    () => volunteerStudentDistances.filter((x) => x.dist <= 5.0).slice(0, 6),
    [volunteerStudentDistances]
  );

  // Set of student IDs connected to selected volunteer (for icon highlight)
  const nearVolunteerStudentIds = useMemo(
    () => new Set(nearestStudents.map((x) => x.student.id)),
    [nearestStudents]
  );

  // ── Connection lines ──────────────────────────────────────────────────────
  const activeConnections = useMemo(() => {
    const lines: {
      id: string;
      from: [number, number];
      to: [number, number];
      dist: number;
      color: string;
      isFocus: boolean;
    }[] = [];

    if (selectedVolunteer) {
      // Show top-4 nearest (from panel nearest list – already sorted by dist)
      volunteerStudentDistances.slice(0, 4).forEach(({ student, dist }) => {
        lines.push({
          id: `focus-${selectedVolunteer.id}-${student.id}`,
          from: [selectedVolunteer.lat, selectedVolunteer.lng],
          to: [student.lat, student.lng],
          dist,
          color: getLineColor(dist),
          isFocus: true,
        });
      });
      return lines;
    }

    if (!showDefaultLines) return [];

    volunteers.forEach((v) => {
      let closestStudent = students[0];
      let minDist = 9999;
      students.forEach((s) => {
        const d = getDistanceKm(v.lat, v.lng, s.lat, s.lng);
        if (d < minDist) { minDist = d; closestStudent = s; }
      });
      if (closestStudent && minDist <= 5.0) {
        lines.push({
          id: `def-${v.id}-${closestStudent.id}`,
          from: [v.lat, v.lng],
          to: [closestStudent.lat, closestStudent.lng],
          dist: minDist,
          color: "#16834A",
          isFocus: false,
        });
      }
    });

    return lines;
  }, [volunteers, students, selectedVolunteer, volunteerStudentDistances, showDefaultLines]);

  const markerOpacity = isDimmed ? 0.15 : 1.0;
  const shouldShowDistanceBadge = currentZoom >= 13.5 || Boolean(selectedVolunteerId);

  return (
    <div className="relative h-full w-full bg-[#f4f4f0] overflow-hidden select-none">
      {/* ── LEGEND ─────────────────────────────────────────── */}
      <div className="absolute top-3.5 right-3.5 z-[1000] bg-white/95 backdrop-blur-md border-[2.5px] border-black rounded-[8px] shadow-[3px_3px_0_#111] px-3 py-1.5 flex items-center gap-2.5 font-mono text-xs">
        <span className="font-black text-sm uppercase tracking-wider text-black">{district.name}</span>
        <div className="h-4 w-[2px] bg-black/25" />
        <div className="flex items-center gap-2.5 text-[10px] font-bold">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#2457C5] border border-black" />
            <span>Eng</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#B85A12] border border-black" />
            <span>Arts</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#111] border border-[#FFC20E]" style={{ transform: "rotate(45deg)", display: "inline-block" }} />
            <span>Vol</span>
          </div>
        </div>
      </div>

      {/* ── SELECTION BANNER ───────────────────────────────── */}
      {(selectedStudent || selectedVolunteer) && (
        <div className="absolute top-3.5 left-3.5 z-[1000] bg-[#FFD600] border-2 border-black rounded-[6px] shadow-[2px_2px_0_#111] px-3 py-1 text-xs font-mono font-bold flex items-center gap-2 max-w-[260px]">
          <span className="truncate">
            {selectedStudent
              ? `🎯 ${selectedStudent.name}`
              : `🤝 ${selectedVolunteer?.name}`}
          </span>
          <button
            onClick={() => {
              onSelectStudent(null);
              onSelectVolunteer(null);
              setRecenterCount((c) => c + 1);
            }}
            className="px-1.5 bg-black text-[#FFC20E] rounded text-[9px] cursor-pointer hover:bg-gray-800 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── FLOATING VOLUNTEER PANEL ────────────────────────── */}
      {selectedVolunteer && panelVisible && (
        <VolunteerInfoPanel
          volunteer={selectedVolunteer}
          nearbyStudents={nearestStudents}
          allStudents={volunteerStudentDistances}
          onSelectStudent={(id) => {
            onSelectVolunteer(null); // keep panel? we keep it for UX
            onSelectStudent(id);
          }}
          onClose={() => {
            setPanelVisible(false);
            onSelectVolunteer(null);
          }}
        />
      )}

      {/* ── FAB ────────────────────────────────────────────── */}
      <div className="absolute bottom-5 right-4 z-[1000] flex flex-col-reverse items-center gap-2.5">
        <button
          onClick={() => setFabOpen((p) => !p)}
          className={`w-11 h-11 rounded-full border-[2.5px] border-black shadow-[3px_3px_0_#111] flex items-center justify-center font-bold text-base transition-transform cursor-pointer relative group ${
            fabOpen ? "bg-black text-[#FFC20E] rotate-45" : "bg-[#FFC20E] text-black hover:scale-105"
          }`}
          aria-label="Map Tools"
        >
          <span>{fabOpen ? "＋" : "⚙️"}</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute right-14 bg-black text-[#FFC20E] text-[10px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap">
            {fabOpen ? "Close Tools" : "Map Controls"}
          </span>
        </button>

        {fabOpen && (
          <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Recenter */}
            <div className="relative group">
              <button
                onClick={() => {
                  onSelectStudent(null);
                  onSelectVolunteer(null);
                  setRecenterCount((c) => c + 1);
                }}
                className="w-10 h-10 rounded-full bg-white hover:bg-[#FFC20E] text-black border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center cursor-pointer hover:scale-105 transition-all"
              >
                🎯
              </button>
              <span className="opacity-0 group-hover:opacity-100 pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFC20E] text-[10px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap transition-opacity">
                Centerise View
              </span>
            </div>

            {/* Dim / Ghost */}
            <div className="relative group">
              <button
                onClick={() => setIsDimmed((p) => !p)}
                className={`w-10 h-10 rounded-full border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center cursor-pointer hover:scale-105 transition-all ${
                  isDimmed ? "bg-[#D92D20] text-white" : "bg-white hover:bg-black hover:text-[#FFC20E] text-black"
                }`}
              >
                {isDimmed ? "🕶️" : "👁️"}
              </button>
              <span className="opacity-0 group-hover:opacity-100 pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFC20E] text-[10px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap transition-opacity">
                {isDimmed ? "Restore Pins" : "Ghost / Dim Pins"}
              </span>
            </div>

            {/* Toggle lines */}
            <div className="relative group">
              <button
                onClick={() => {
                  onSelectVolunteer(null);
                  setShowDefaultLines((p) => !p);
                }}
                className={`w-10 h-10 rounded-full border-2 border-black shadow-[2px_2px_0_#111] flex items-center justify-center cursor-pointer hover:scale-105 transition-all ${
                  showDefaultLines
                    ? "bg-[#DDF5E6] text-[#16834A]"
                    : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                ⚡
              </button>
              <span className="opacity-0 group-hover:opacity-100 pointer-events-none absolute right-12 top-1.5 bg-black text-[#FFC20E] text-[10px] font-mono font-bold px-2 py-1 rounded border border-[#FFC20E] shadow-[2px_2px_0_#111] whitespace-nowrap transition-opacity">
                {showDefaultLines ? "Hide Distance Lines" : "Show Distance Lines"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── MAP CONTAINER ───────────────────────────────────── */}
      <MapContainer
        key={`map-container-${district.name}`}
        center={districtBoundary ? districtBoundary.urbanCenter : [district.lat, district.lng]}
        zoom={12}
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

        {/* District boundary layer */}
        {districtBoundary && (
          <GeoJSON
            key={`boundary-layer-${district.name}`}
            data={districtBoundary as any}
            style={() => ({
              color: "#111111",
              weight: 2,
              dashArray: "4, 5",
              fillColor: "#FFC20E",
              fillOpacity: 0.04,
              lineCap: "round",
              lineJoin: "round",
            })}
          />
        )}

        {/* ── CONNECTION LINES ─────────────────────────────── */}
        {activeConnections.map((conn) => {
          const midLat = (conn.from[0] + conn.to[0]) / 2;
          const midLng = (conn.from[1] + conn.to[1]) / 2;
          const lineOpacity = isDimmed ? 0.06 : conn.isFocus ? 0.9 : 0.6;

          return (
            <Polyline
              key={conn.id}
              positions={[conn.from, conn.to]}
              pathOptions={{
                color: conn.color,
                weight: conn.isFocus ? 2 : 1.5,
                opacity: lineOpacity,
                // All lines use dotted style – focus lines slightly denser
                dashArray: conn.isFocus ? "3, 5" : "2, 7",
              }}
            >
              {/* Distance badge: only when zoomed-in or volunteer selected */}
              {!isDimmed && shouldShowDistanceBadge && (
                <Tooltip
                  position={[midLat, midLng]}
                  permanent={true}
                  direction="center"
                  className="distance-badge"
                >
                  <span
                    style={{
                      background: conn.color,
                      color: "#fff",
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 9,
                      fontWeight: 900,
                      border: "1px solid #111",
                      boxShadow: "1px 1px 0 #111",
                      lineHeight: 1.5,
                    }}
                  >
                    {conn.dist} km
                  </span>
                </Tooltip>
              )}
            </Polyline>
          );
        })}

        {/* ── HQ MARKER ───────────────────────────────────── */}
        <Marker position={[district.lat, district.lng]} icon={createHqIcon(markerOpacity)}>
          <Popup>
            <div className="p-1 font-sans text-xs">
              <div className="font-bold text-sm text-[#111]">{district.name} HQ</div>
              <div className="text-[11px] text-[#555] font-mono mt-0.5">
                Applicants: <b>{district.totalApplicants.toLocaleString()}</b>
              </div>
            </div>
          </Popup>
        </Marker>

        {/* ── STUDENT POPUP (from map click) ──────────────── */}
        {selectedStudent && (
          <Popup
            key={`focused-${selectedStudent.id}`}
            position={[selectedStudent.lat, selectedStudent.lng]}
            offset={[0, -12]}
            autoPan={false}
            eventHandlers={{ remove: () => onSelectStudent(null) }}
          >
            <div className="p-1 font-sans text-xs min-w-[180px]">
              <div className="flex justify-between items-center gap-1.5 mb-1">
                <span className="font-black text-sm text-[#111]">{selectedStudent.name}</span>
                <span className="badge-stream">{selectedStudent.opted}</span>
              </div>
              <div className="font-mono text-[11px] space-y-0.5 text-[#333]">
                <div>Marks: <b>{selectedStudent.marks} / 600</b></div>
                <div>Gender: <b>{selectedStudent.gender}</b></div>
                <div>Parents: <b>{selectedStudent.parents}</b></div>
                <div>
                  Own House:{" "}
                  <b className={selectedStudent.ownHouse === "Yes" ? "text-[#D92D20]" : "text-green-700"}>
                    {selectedStudent.ownHouse}
                  </b>
                </div>
              </div>
              <div className="mt-1.5 text-[10px] font-mono">
                {selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes" ? (
                  <span className="income-red-tag">₹{selectedStudent.familyIncome.toLocaleString()}</span>
                ) : (
                  <span className="font-bold">Income: ₹{selectedStudent.familyIncome.toLocaleString()}</span>
                )}
              </div>
            </div>
          </Popup>
        )}

        {/* ── STUDENT MARKERS ─────────────────────────────── */}
        {students.map((student) => {
          const isHighIncome = student.familyIncome > 100000;
          const hasOwnHouse = student.ownHouse === "Yes";
          const isSelected = selectedStudentId === student.id;
          const isNear = nearVolunteerStudentIds.has(student.id);
          return (
            <Marker
              key={student.id}
              position={[student.lat, student.lng]}
              icon={createStudentDotIcon(
                student.opted,
                isHighIncome,
                hasOwnHouse,
                isSelected,
                markerOpacity,
                isNear
              )}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onSelectVolunteer(null);
                  onSelectStudent(isSelected ? null : student.id);
                },
              }}
            />
          );
        })}

        {/* ── VOLUNTEER POPUP (small – panel handles the detail) ── */}
        {selectedVolunteer && (
          <Popup
            key={`focused-vol-${selectedVolunteer.id}`}
            position={[selectedVolunteer.lat, selectedVolunteer.lng]}
            offset={[0, -12]}
            autoPan={false}
            eventHandlers={{ remove: () => onSelectVolunteer(null) }}
          >
            <div className="p-1 font-sans text-xs min-w-[150px]">
              <div className="flex justify-between items-center gap-1.5">
                <span className="font-black text-sm text-[#111]">{selectedVolunteer.name}</span>
                <span className="px-1 py-0.5 bg-black text-[#FFC20E] rounded text-[8px] font-mono font-bold">VOL</span>
              </div>
              <div className="text-[10px] text-[#555] mt-0.5 truncate">🎓 {selectedVolunteer.college}</div>
              <div className="text-[9px] text-[#888] mt-0.5 font-mono">
                See panel → for student details
              </div>
            </div>
          </Popup>
        )}

        {/* ── VOLUNTEER MARKERS ───────────────────────────── */}
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
                  onSelectStudent(null);
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
