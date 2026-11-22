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
} from "react-leaflet";
import L from "leaflet";
import { District, Student, Volunteer } from "@/data/districts";

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

function getLineColor(dist: number): string {
  return dist <= 5.0 ? "#16834A" : "#D92D20";
}

// Student Dot Icon (Bigger, Color-based)
const createStudentDotIcon = (
  opted: string,
  isHighIncome: boolean,
  hasOwnHouse: boolean,
  isSelected: boolean,
  opacity: number
) => {
  const isRedEntity = isHighIncome || hasOwnHouse;
  const bg = isRedEntity ? "#D92D20" : opted === "Eng" ? "#2457C5" : "#B85A12";
  const ring = isSelected ? "#FFD600" : isRedEntity ? "#912018" : "#111111";
  const size = isSelected ? 24 : 19;

  return L.divIcon({
    className: "student-dot",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${bg};
        border: ${isSelected ? "3px" : "2.5px"} solid ${ring};
        border-radius: 50%;
        box-shadow: ${isSelected ? "0 0 0 3px #111, 3px 3px 0 #111" : "2px 2px 0 #111"};
        opacity: ${opacity};
        transform: translate(-50%, -50%);
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        ${isRedEntity && !isSelected ? "outline: 2px solid #D92D20; outline-offset: 1px;" : ""}
      ">
        <div style="width: ${isSelected ? 7 : 5}px; height: ${isSelected ? 7 : 5}px; background: #FFFFFF; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Volunteer Diamond Icon
const createVolunteerDotIcon = (isSelected: boolean, opacity: number) => {
  const size = isSelected ? 26 : 21;
  return L.divIcon({
    className: "volunteer-dot",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: #111111;
        border: ${isSelected ? "3px" : "2.5px"} solid #FFC20E;
        border-radius: 4px;
        box-shadow: ${isSelected ? "0 0 0 2px #111, 3px 3px 0 #111" : "2.5px 2.5px 0 #111"};
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: ${opacity};
        transform: translate(-50%, -50%) rotate(45deg);
        transition: all 0.2s ease;
        cursor: pointer;
      ">
        <div style="width: ${isSelected ? 8 : 6}px; height: ${isSelected ? 8 : 6}px; background: #FFC20E; border-radius: 50%;"></div>
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
        border: 2.5px solid #111;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        font-size: 14px;
        box-shadow: 3px 3px 0 #111;
        opacity: ${opacity};
        transform: translate(-50%, -50%);
        transition: opacity 0.25s ease;
        cursor: pointer;
      ">🏛️</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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
    click(e) {
      onClearFocus();
    },
  });

  // Initial district lock
  useEffect(() => {
    const sw = L.latLng(district.lat - district.delta, district.lng - district.delta);
    const ne = L.latLng(district.lat + district.delta, district.lng + district.delta);
    const bounds = L.latLngBounds(sw, ne);

    map.fitBounds(bounds, { padding: [0, 0] });
    const fitZoom = map.getBoundsZoom(bounds);
    map.setMinZoom(fitZoom);
    map.setMaxBounds(bounds);
    onZoomChange(fitZoom);
  }, [district, map, onZoomChange]);

  // Zoom into selected Student
  useEffect(() => {
    if (selectedStudent) {
      map.flyTo([selectedStudent.lat, selectedStudent.lng], 14, { duration: 0.6 });
    }
  }, [selectedStudent, map]);

  // Zoom into selected Volunteer
  useEffect(() => {
    if (selectedVolunteer) {
      map.flyTo([selectedVolunteer.lat, selectedVolunteer.lng], 13.5, { duration: 0.6 });
    }
  }, [selectedVolunteer, map]);

  // Centerise view back to district bounds
  useEffect(() => {
    if (recenterTrigger > 0 || (!selectedStudent && !selectedVolunteer)) {
      const sw = L.latLng(district.lat - district.delta, district.lng - district.delta);
      const ne = L.latLng(district.lat + district.delta, district.lng + district.delta);
      const bounds = L.latLngBounds(sw, ne);
      map.flyToBounds(bounds, { duration: 0.6, padding: [0, 0] });
    }
  }, [recenterTrigger, selectedStudent, selectedVolunteer, district, map]);

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
  const [currentZoom, setCurrentZoom] = useState(11);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedVolunteer = useMemo(
    () => volunteers.find((v) => v.id === selectedVolunteerId) || null,
    [volunteers, selectedVolunteerId]
  );

  // Square bounding box coordinates
  const bounds = useMemo(() => {
    const sw = L.latLng(district.lat - district.delta, district.lng - district.delta);
    const ne = L.latLng(district.lat + district.delta, district.lng + district.delta);
    return L.latLngBounds(sw, ne);
  }, [district]);

  // STRICT Volunteer-to-Student Connection Lines
  const activeConnections = useMemo(() => {
    const lines: {
      id: string;
      volunteerId: string;
      from: [number, number];
      to: [number, number];
      dist: number;
      color: string;
      isFocus: boolean;
    }[] = [];

    if (selectedVolunteer) {
      const sorted = students
        .map((s) => ({
          student: s,
          dist: getDistanceKm(selectedVolunteer.lat, selectedVolunteer.lng, s.lat, s.lng),
        }))
        .sort((a, b) => a.dist - b.dist);

      sorted.slice(0, 4).forEach((item) => {
        lines.push({
          id: `focus-${selectedVolunteer.id}-${item.student.id}`,
          volunteerId: selectedVolunteer.id,
          from: [selectedVolunteer.lat, selectedVolunteer.lng],
          to: [item.student.lat, item.student.lng],
          dist: item.dist,
          color: getLineColor(item.dist),
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
        if (d < minDist) {
          minDist = d;
          closestStudent = s;
        }
      });

      if (closestStudent && minDist <= 5.0) {
        lines.push({
          id: `def-${v.id}-${closestStudent.id}`,
          volunteerId: v.id,
          from: [v.lat, v.lng],
          to: [closestStudent.lat, closestStudent.lng],
          dist: minDist,
          color: "#16834A",
          isFocus: false,
        });
      }
    });

    return lines;
  }, [volunteers, students, selectedVolunteer, showDefaultLines]);

  const markerOpacity = isDimmed ? 0.15 : 1.0;
  const shouldShowDistanceBadge = currentZoom >= 12.8 || Boolean(selectedVolunteerId);

  return (
    <div className="relative h-full w-full bg-[#f4f4f0] overflow-hidden select-none">
      {/* PROMINENT BIGGER LEGEND BOX */}
      <div className="absolute top-3.5 right-3.5 z-[1000] bg-white/95 backdrop-blur-md border-[2.5px] border-black rounded-[8px] shadow-[3px_3px_0_#111] px-4 py-2 flex items-center gap-3 font-mono text-xs">
        <span className="font-black text-sm uppercase tracking-wider text-black">{district.name}</span>
        <div className="h-4 w-[2px] bg-black/25"></div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#2457C5] border-2 border-black shadow-[1px_1px_0_#111]"></span>
            <span>Engineering</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#B85A12] border-2 border-black shadow-[1px_1px_0_#111]"></span>
            <span>Arts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-sm bg-[#111] border-2 border-[#FFC20E] shadow-[1px_1px_0_#111]"></span>
            <span>Volunteers</span>
          </div>
        </div>
      </div>

      {/* ACTIVE SELECTION BANNER */}
      {(selectedStudent || selectedVolunteer) && (
        <div className="absolute top-3.5 left-3.5 z-[1000] bg-[#FFD600] border-2 border-black rounded-[6px] shadow-[2px_2px_0_#111] px-3 py-1 text-xs font-mono font-bold flex items-center gap-2">
          <span>
            {selectedStudent ? `🎯 Focused: ${selectedStudent.name}` : `🤝 Focused: ${selectedVolunteer?.name}`}
          </span>
          <button
            onClick={() => {
              onSelectStudent(null);
              onSelectVolunteer(null);
              setRecenterCount((c) => c + 1);
            }}
            className="px-1.5 py-0.2 bg-black text-[#FFC20E] rounded text-[10px] cursor-pointer hover:bg-gray-800"
          >
            Centerise ✕
          </button>
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
                  onSelectVolunteer(null);
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
        center={[district.lat, district.lng]}
        zoom={11}
        minZoom={10}
        maxZoom={16}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        wheelPxPerZoomLevel={160}
        wheelDebounceTime={80}
        zoomSnap={0.5}
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

        {/* PROXIMITY CONNECTION LINES: STRICTLY VOLUNTEER TO STUDENT */}
        {activeConnections.map((conn) => {
          const midLat = (conn.from[0] + conn.to[0]) / 2;
          const midLng = (conn.from[1] + conn.to[1]) / 2;
          const lineOpacity = isDimmed ? 0.08 : conn.isFocus ? 1.0 : 0.75;

          return (
            <Polyline
              key={conn.id}
              positions={[conn.from, conn.to]}
              pathOptions={{
                color: conn.color,
                weight: conn.isFocus ? 4 : 2.5,
                opacity: lineOpacity,
                dashArray: conn.isFocus ? undefined : "5, 5",
              }}
            >
              {!isDimmed && shouldShowDistanceBadge && (
                <Tooltip
                  position={[midLat, midLng]}
                  permanent={true}
                  direction="center"
                  className="distance-badge"
                >
                  <span
                    style={{
                      backgroundColor: conn.color,
                      color: "#FFFFFF",
                      padding: "2px 6px",
                      borderRadius: "3px",
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "10px",
                      fontWeight: 900,
                      border: "1.5px solid #111",
                      boxShadow: "2px 2px 0 #111",
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

        {/* DEDICATED POPUP FOR CLICKED STUDENT (Shows immediately on click) */}
        {selectedStudent && (
          <Popup
            key={`focused-${selectedStudent.id}`}
            position={[selectedStudent.lat, selectedStudent.lng]}
            offset={[0, -14]}
            autoPan={false}
            eventHandlers={{
              remove: () => onSelectStudent(null),
            }}
          >
            <div className="p-1 font-sans text-xs min-w-[190px]">
              <div className="flex justify-between items-center gap-1.5">
                <span className="font-black text-sm text-[#111]">{selectedStudent.name}</span>
                <span className="badge-stream">{selectedStudent.opted}</span>
              </div>

              <div className="mt-1.5 font-mono text-[11px] space-y-1 text-[#333]">
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

              <div className="mt-2 text-[10px] font-mono">
                {selectedStudent.familyIncome > 100000 || selectedStudent.ownHouse === "Yes" ? (
                  <span className="income-red-tag">₹{selectedStudent.familyIncome.toLocaleString()}</span>
                ) : (
                  <span className="font-bold">Income: ₹{selectedStudent.familyIncome.toLocaleString()}</span>
                )}
              </div>
            </div>
          </Popup>
        )}

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
                  onSelectVolunteer(null);
                  onSelectStudent(isSelected ? null : student.id);
                },
              }}
            />
          );
        })}

        {/* DEDICATED POPUP FOR CLICKED VOLUNTEER (Shows immediately on click) */}
        {selectedVolunteer && (
          <Popup
            key={`focused-${selectedVolunteer.id}`}
            position={[selectedVolunteer.lat, selectedVolunteer.lng]}
            offset={[0, -14]}
            autoPan={false}
            eventHandlers={{
              remove: () => onSelectVolunteer(null),
            }}
          >
            <div className="p-1 font-sans text-xs min-w-[190px]">
              <div className="flex justify-between items-center gap-1.5">
                <span className="font-black text-sm text-[#111]">{selectedVolunteer.name}</span>
                <span className="px-1.5 py-0.5 bg-black text-[#FFC20E] rounded text-[9px] font-mono font-bold">
                  VOLUNTEER
                </span>
              </div>

              <div className="text-[11px] text-[#555] font-semibold mt-1 truncate">
                🎓 {selectedVolunteer.college}
              </div>

              <div className="mt-2 font-mono text-[10px] grid grid-cols-2 gap-1.5 bg-yellow-50 p-1.5 border border-black rounded">
                <div>PV Done: <b>{selectedVolunteer.pvCount}</b></div>
                <div>Assigned: <b>{selectedVolunteer.pvAssigned}</b></div>
                <div className="col-span-2 text-green-700 font-bold">
                  Nearby Students: {selectedVolunteer.nearToApplicants}
                </div>
              </div>
            </div>
          </Popup>
        )}

        {/* ALL VOLUNTEERS RENDERED */}
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
