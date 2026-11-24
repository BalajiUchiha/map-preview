"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { DISTRICTS, District, Student, Volunteer, getDistanceKm } from "@/data/districts";

// Load Leaflet Map on client-side only (SSR: false)
const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#f4f4f0] flex flex-col items-center justify-center gap-2">
      <div className="w-7 h-7 border-3 border-black border-t-[#FFC20E] rounded-full animate-spin"></div>
      <span className="font-mono text-[11px] uppercase font-bold tracking-wider">
        Loading District Map...
      </span>
    </div>
  ),
});

type TabType = "summary" | "students" | "volunteers";

export default function MaatramApp() {
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [mapWidthPercent, setMapWidthPercent] = useState<number>(60);
  const [isDragging, setIsDragging] = useState(false);
  const [gridSearch, setGridSearch] = useState("");

  // Student and Volunteer focus selection
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);

  // Student filter controls
  const [studentCategoryFilter, setStudentCategoryFilter] = useState("all");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // Volunteer search
  const [volunteerSearchQuery, setVolunteerSearchQuery] = useState("");

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const activeVolunteerCardRef = useRef<HTMLDivElement>(null);

  const handleSelectVolunteer = (id: string | null) => {
    setSelectedVolunteerId(id);
    if (id) {
      setActiveTab("volunteers");
    }
  };

  // Auto-scroll to selected volunteer card in sidebar when clicked on map or list
  useEffect(() => {
    if (selectedVolunteerId && activeTab === "volunteers") {
      const timer = setTimeout(() => {
        activeVolunteerCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [selectedVolunteerId, activeTab]);

  // When switching tabs or filters, clear active selection to auto-centerise view and clear lines
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedStudentId(null);
    setSelectedVolunteerId(null);
  };

  const handleStudentFilterChange = (filter: string) => {
    setStudentCategoryFilter(filter);
    setSelectedStudentId(null);
    setSelectedVolunteerId(null);
  };

  const handleStudentSearchChange = (query: string) => {
    setStudentSearchQuery(query);
    setSelectedStudentId(null);
    setSelectedVolunteerId(null);
  };

  // Mouse drag handler to resize map width with cursor
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const newPercent = (relativeX / rect.width) * 100;
      if (newPercent >= 20 && newPercent <= 80) {
        setMapWidthPercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  // Filtered districts for Screen 1
  const filteredDistricts = useMemo(() => {
    if (!gridSearch.trim()) return DISTRICTS;
    return DISTRICTS.filter((d) =>
      d.name.toLowerCase().includes(gridSearch.toLowerCase().trim())
    );
  }, [gridSearch]);

  // Filtered students for Screen 2 Tab "Students"
  const filteredStudents = useMemo(() => {
    if (!selectedDistrict) return [];
    let list = selectedDistrict.students;

    if (studentCategoryFilter === "eng") {
      list = list.filter((s) => s.opted === "Eng");
    } else if (studentCategoryFilter === "arts") {
      list = list.filter((s) => s.opted === "Arts");
    } else if (studentCategoryFilter === "male") {
      list = list.filter((s) => s.gender === "Male");
    } else if (studentCategoryFilter === "female") {
      list = list.filter((s) => s.gender === "Female");
    } else if (studentCategoryFilter === "both") {
      list = list.filter((s) => s.parents === "Both");
    } else if (studentCategoryFilter === "single") {
      list = list.filter((s) => s.parents === "Single");
    } else if (studentCategoryFilter === "orphan") {
      list = list.filter((s) => s.parents === "Orphan");
    } else if (studentCategoryFilter === "above_1lakh") {
      list = list.filter((s) => s.familyIncome > 100000);
    } else if (studentCategoryFilter === "below_1lakh") {
      list = list.filter((s) => s.familyIncome <= 100000);
    } else if (studentCategoryFilter === "own_house") {
      list = list.filter((s) => s.ownHouse === "Yes");
    }

    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase().trim();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.marks.toString().includes(q)
      );
    }

    return list;
  }, [selectedDistrict, studentCategoryFilter, studentSearchQuery]);

  // Filtered volunteers for Screen 2 Tab "Volunteers"
  const filteredVolunteers = useMemo(() => {
    if (!selectedDistrict) return [];
    let list = selectedDistrict.volunteers;
    if (volunteerSearchQuery.trim()) {
      const q = volunteerSearchQuery.toLowerCase().trim();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.college.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedDistrict, volunteerSearchQuery]);

  // Nearby students for the active selected volunteer (closest within 5km)
  const nearbyStudentsForActiveVol = useMemo(() => {
    if (!selectedDistrict || !selectedVolunteerId) return [];
    const currentVol = selectedDistrict.volunteers.find((v) => v.id === selectedVolunteerId);
    if (!currentVol) return [];
    const allSorted = selectedDistrict.students
      .map((s) => ({
        student: s,
        dist: getDistanceKm(currentVol.lat, currentVol.lng, s.lat, s.lng),
      }))
      .sort((a, b) => a.dist - b.dist);
    const within5 = allSorted.filter((item) => item.dist <= 5.0);
    return within5.length > 0 ? within5 : allSorted.slice(0, 4);
  }, [selectedDistrict, selectedVolunteerId]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F5F5F2] text-[#111111] overflow-hidden">
      {/* Topbar adhering to Maatram Design System */}
      <header className="h-[56px] shrink-0 bg-[#FFC20E] border-b-[3px] border-[#111111] px-4 md:px-6 flex justify-between items-center gap-3 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#111111] text-[#FFC20E] rounded-full flex items-center justify-center font-mono font-black text-sm shadow-[2px_2px_0_#fff]">
            M
          </div>
          <div>
            <div className="font-black text-base md:text-lg tracking-tight leading-none flex items-center gap-1.5">
              MAATRAM
              <span className="text-[10px] font-mono font-medium px-1 py-0.2 bg-black text-[#FFC20E] rounded">
                ADMISSIONS
              </span>
            </div>
            <div className="text-[9px] font-mono tracking-widest uppercase text-black/70">
              Tamil Nadu State Operations
            </div>
          </div>
        </div>

        {selectedDistrict ? (
          <button
            onClick={() => {
              setSelectedDistrict(null);
              setSelectedStudentId(null);
              setSelectedVolunteerId(null);
            }}
            className="neo-btn bg-white hover:bg-black hover:text-[#FFC20E] px-3 py-1 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
          >
            ← Back to Districts
          </button>
        ) : (
          <div className="text-xs font-mono font-bold border-2 border-black bg-white px-2.5 py-1 rounded shadow-[2px_2px_0_#111]">
            38 Districts
          </div>
        )}
      </header>

      {/* SCREEN 1: 3x3 Desktop & 2x2 Mobile District Grid (Scrollable) */}
      {!selectedDistrict ? (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5 pb-3 border-b-2 border-black/10">
            <div>
              <div className="inline-flex bg-[#111] text-[#FFC20E] px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wider mb-1">
                DISTRICT PORTAL
              </div>
              <h1 className="text-xl md:text-3xl font-black tracking-tight leading-none">
                Select a District
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search district..."
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                className="border-2 border-black rounded-[7px] px-3 py-1.5 text-xs bg-white outline-none w-52 shadow-[2px_2px_0_#111] focus:bg-[#fffdf5]"
              />
              {gridSearch && (
                <button
                  onClick={() => setGridSearch("")}
                  className="neo-btn bg-gray-200 px-2 py-1.5 text-xs font-mono cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 pb-12">
            {filteredDistricts.map((district) => (
              <div
                key={district.name}
                onClick={() => {
                  setSelectedDistrict(district);
                  setActiveTab("summary");
                  setSelectedStudentId(null);
                  setSelectedVolunteerId(null);
                }}
                className="neo-card p-3.5 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <h2 className="font-black text-base md:text-lg tracking-tight text-[#111] truncate">
                      {district.name}
                    </h2>
                    <span className="w-5 h-5 rounded-full border border-black bg-[#FFC20E] flex items-center justify-center font-bold text-[10px] group-hover:bg-black group-hover:text-[#FFC20E] shrink-0">
                      ↗
                    </span>
                  </div>

                  <div className="mt-2.5 bg-[#F5F5F2] border-2 border-black rounded-lg p-2.5">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[#777]">
                      Applicants
                    </div>
                    <div className="font-mono font-black text-xl md:text-2xl tracking-tight text-[#111]">
                      {district.totalApplicants.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-black/10 flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#2457C5] border border-black"></span>
                    <span className="text-[#555]">M:</span>
                    <span className="font-bold">{district.male}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#B85A12] border border-black"></span>
                    <span className="text-[#555]">F:</span>
                    <span className="font-bold">{district.female}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      ) : (
        /* SCREEN 2: Viewport-locked split screen */
        <div
          ref={splitContainerRef}
          className="flex-1 flex flex-col md:flex-row overflow-hidden relative select-none"
        >
          {/* Map Side (Fixed in viewport, no empty outer space, edge-to-edge) */}
          <div
            style={{ width: `${mapWidthPercent}%` }}
            className="h-[40vh] md:h-full relative overflow-hidden shrink-0 border-b-2 md:border-b-0 border-black"
          >
            <DistrictMap
              district={selectedDistrict}
              students={selectedDistrict.students}
              volunteers={selectedDistrict.volunteers}
              selectedStudentId={selectedStudentId}
              selectedVolunteerId={selectedVolunteerId}
              onSelectStudent={setSelectedStudentId}
              onSelectVolunteer={handleSelectVolunteer}
            />
          </div>

          {/* Draggable Divider (Desktop Cursor Resize) */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            className="hidden md:flex w-2.5 bg-[#111111] hover:bg-[#FFC20E] cursor-col-resize items-center justify-center z-30 transition-colors select-none group"
            title="Click and drag to resize map & sidebar"
          >
            <div className="w-1 h-8 rounded-full bg-white group-hover:bg-black pointer-events-none"></div>
          </div>

          {/* 40% Sidebar (h-full flex-col, internal list scrolls, tabs strictly in viewport) */}
          <div className="flex-1 flex flex-col h-full bg-[#F5F5F2] overflow-hidden min-w-[290px]">
            {/* Compact Header */}
            <div className="p-3 bg-white border-b-2 border-black shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[#777]">
                    District View
                  </div>
                  <h2 className="text-base md:text-lg font-black tracking-tight text-[#111] leading-tight">
                    {selectedDistrict.name}
                  </h2>
                </div>

                <div className="bg-[#FFF1B8] border-2 border-black rounded px-2.5 py-1 text-right shadow-[2px_2px_0_#111]">
                  <span className="text-[9px] font-mono uppercase text-black/70 mr-1.5">Total</span>
                  <span className="font-mono font-black text-sm">
                    {selectedDistrict.totalApplicants.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
                <span className="px-1.5 py-0.5 bg-[#E5EDFF] border border-black rounded font-semibold text-[#2457C5]">
                  Male: {selectedDistrict.male}
                </span>
                <span className="px-1.5 py-0.5 bg-[#FFF0D9] border border-black rounded font-semibold text-[#B85A12]">
                  Female: {selectedDistrict.female}
                </span>
                <span className="text-[#777] ml-auto">Boundary Locked</span>
              </div>
            </div>

            {/* Scrollable details list inside viewport */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* TAB 1: SUMMARY */}
              {activeTab === "summary" && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border-2 border-black rounded-lg p-2.5 shadow-[2px_2px_0_#111]">
                      <div className="text-[9px] font-mono text-[#777] uppercase font-bold">
                        Engineering
                      </div>
                      <div className="font-mono font-black text-xl text-[#2457C5] mt-0.5">
                        {Math.round(selectedDistrict.totalApplicants * 0.62)}
                      </div>
                      <div className="text-[9px] font-mono text-green-700 font-bold">
                        ~62% of applicants
                      </div>
                    </div>

                    <div className="bg-white border-2 border-black rounded-lg p-2.5 shadow-[2px_2px_0_#111]">
                      <div className="text-[9px] font-mono text-[#777] uppercase font-bold">
                        Arts & Science
                      </div>
                      <div className="font-mono font-black text-xl text-[#B85A12] mt-0.5">
                        {Math.round(selectedDistrict.totalApplicants * 0.38)}
                      </div>
                      <div className="text-[9px] font-mono text-[#555] font-bold">
                        ~38% of applicants
                      </div>
                    </div>
                  </div>

                  {/* Income Distribution Card */}
                  <div className="bg-white border-2 border-black rounded-lg p-3 shadow-[2px_2px_0_#111]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] uppercase font-mono">
                        Eligibility Status
                      </span>
                      <span className="text-[9px] font-mono bg-[#DDF5E6] text-[#16834A] border border-[#16834A] px-1.5 py-0.2 rounded font-bold">
                        Priority Filter
                      </span>
                    </div>

                    <div className="mt-2 text-xs font-mono flex justify-between">
                      <span className="text-gray-600">Eligible (≤ 1L & No Own House):</span>
                      <span className="font-bold text-green-700">
                        {Math.round(selectedDistrict.totalApplicants * 0.68)} (68%)
                      </span>
                    </div>

                    <div className="mt-1 text-xs font-mono flex justify-between">
                      <span className="text-[#D92D20] font-semibold">&gt; 1L or Own House (Whole Red):</span>
                      <span className="income-red-tag">
                        {Math.round(selectedDistrict.totalApplicants * 0.32)} (32%)
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 border border-black rounded-full h-2.5 mt-2 overflow-hidden flex">
                      <div className="bg-[#16834A] h-full w-[68%]"></div>
                      <div className="bg-[#D92D20] h-full w-[32%]"></div>
                    </div>
                  </div>

                  {/* Volunteers Summary */}
                  <div className="bg-white border-2 border-black rounded-lg p-3 shadow-[2px_2px_0_#111]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] uppercase font-mono">
                        PV Verification Status
                      </span>
                      <span className="text-[9px] font-mono bg-[#FFF1B8] border border-black px-1.5 py-0.2 rounded font-bold">
                        {selectedDistrict.volunteers.length} Active PVs
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                      <div className="bg-gray-50 border border-black rounded p-1.5">
                        <div className="text-[8px] text-[#777]">Assigned</div>
                        <div className="font-black text-sm mt-0.5">
                          {selectedDistrict.volunteers.reduce((acc, v) => acc + v.pvAssigned, 0)}
                        </div>
                      </div>
                      <div className="bg-green-50 border border-black rounded p-1.5">
                        <div className="text-[8px] text-green-700">Completed</div>
                        <div className="font-black text-sm text-green-700 mt-0.5">
                          {selectedDistrict.volunteers.reduce((acc, v) => acc + v.pvCount, 0)}
                        </div>
                      </div>
                      <div className="bg-yellow-50 border border-black rounded p-1.5">
                        <div className="text-[8px] text-yellow-800">Near Reach</div>
                        <div className="font-black text-sm text-yellow-800 mt-0.5">
                          {selectedDistrict.volunteers.reduce((acc, v) => acc + v.nearToApplicants, 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: STUDENTS */}
              {activeTab === "students" && (
                <div className="space-y-2.5">
                  {/* Dropdown (left) + Search (center) */}
                  <div className="flex gap-1.5 bg-white p-2 border-2 border-black rounded-lg shadow-[2px_2px_0_#111]">
                    <select
                      value={studentCategoryFilter}
                      onChange={(e) => handleStudentFilterChange(e.target.value)}
                      className="border border-black rounded px-2 py-1 text-[11px] font-mono bg-white outline-none cursor-pointer w-32 shrink-0"
                    >
                      <option value="all">All</option>
                      <option value="eng">Opt: Eng</option>
                      <option value="arts">Opt: Arts</option>
                      <option value="male">Gender: Male</option>
                      <option value="female">Gender: Female</option>
                      <option value="both">Parents: Both</option>
                      <option value="single">Parents: Single</option>
                      <option value="orphan">Parents: Orphan</option>
                      <option value="above_1lakh">Income: &gt; 1L</option>
                      <option value="own_house">Own House: Yes</option>
                      <option value="below_1lakh">Income: ≤ 1L</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Search student or marks..."
                      value={studentSearchQuery}
                      onChange={(e) => handleStudentSearchChange(e.target.value)}
                      className="flex-1 border border-black rounded px-2 py-1 text-[11px] outline-none min-w-0"
                    />

                    {(studentSearchQuery || studentCategoryFilter !== "all") && (
                      <button
                        onClick={() => {
                          setStudentSearchQuery("");
                          setStudentCategoryFilter("all");
                          setSelectedStudentId(null);
                          setSelectedVolunteerId(null);
                        }}
                        className="neo-btn bg-gray-200 px-1.5 py-1 text-[10px] font-mono cursor-pointer shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Student Cards with Fixed 2x2 Grid Layout & Whole Card Red if Income > 1L or Own House: Yes */}
                  <div className="space-y-2.5">
                    {filteredStudents.map((student) => {
                      const isHighIncome = student.familyIncome > 100000;
                      const hasOwnHouse = student.ownHouse === "Yes";
                      const makeWholeCardRed = isHighIncome || hasOwnHouse;
                      const isSelected = selectedStudentId === student.id;

                      return (
                        <div
                          key={student.id}
                          onClick={() => {
                            setSelectedStudentId((prev) => (prev === student.id ? null : student.id));
                          }}
                          className={`student-card ${makeWholeCardRed ? "high-income" : ""} ${
                            isSelected ? "!border-black !translate-x-[-2px] !translate-y-[-2px] !shadow-[7px_7px_0_#111]" : ""
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <div className="student-name">
                                {student.name}
                              </div>
                              <div className="student-id">
                                {student.id} {isSelected && "• (Focused on Map)"}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="badge-stream">
                                {student.opted}
                              </span>
                              <span className="badge-marks">
                                {student.marks} / 600
                              </span>
                            </div>
                          </div>

                          {/* Fixed 2x2 Clean Grid - Never misplaced or glued together */}
                          <div className="student-card-footer">
                            <div className="footer-item">
                              <span className="text-[#555]">Gender:</span>
                              <b className="text-black">{student.gender}</b>
                            </div>
                            <div className="footer-item justify-end">
                              <span className="text-[#555]">Parents:</span>
                              <b className="text-black">{student.parents}</b>
                            </div>
                            <div className="footer-item">
                              <span className="text-[#555]">Family Income:</span>
                              {isHighIncome ? (
                                <span className="income-red-tag">
                                  ₹{student.familyIncome.toLocaleString()}
                                </span>
                              ) : (
                                <b className="text-black">₹{student.familyIncome.toLocaleString()}</b>
                              )}
                            </div>
                            <div className="footer-item justify-end">
                              <span className="text-[#555]">Own House:</span>
                              {hasOwnHouse ? (
                                <span className="income-red-tag">Yes</span>
                              ) : (
                                <b className="text-green-700">No</b>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredStudents.length === 0 && (
                      <div className="p-4 text-center bg-white border border-dashed border-black/30 rounded-lg text-xs font-mono text-[#777]">
                        No students match filters.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: VOLUNTEERS */}
              {activeTab === "volunteers" && (
                <div className="space-y-2.5">
                  <div className="flex gap-1.5 bg-white p-2 border-2 border-black rounded-lg shadow-[2px_2px_0_#111]">
                    <input
                      type="text"
                      placeholder="Search volunteer or college..."
                      value={volunteerSearchQuery}
                      onChange={(e) => {
                        setVolunteerSearchQuery(e.target.value);
                        setSelectedVolunteerId(null);
                        setSelectedStudentId(null);
                      }}
                      className="flex-1 border border-black rounded px-2 py-1 text-[11px] outline-none"
                    />
                    {volunteerSearchQuery && (
                      <button
                        onClick={() => {
                          setVolunteerSearchQuery("");
                          setSelectedVolunteerId(null);
                          setSelectedStudentId(null);
                        }}
                        className="neo-btn bg-gray-200 px-1.5 py-1 text-[10px] font-mono cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Volunteer Cards (Collapsible: med/small by default, expanded on select) */}
                  <div className="space-y-2.5">
                    {filteredVolunteers.map((vol) => {
                      const isSelected = selectedVolunteerId === vol.id;
                      return (
                        <div
                          key={vol.id}
                          ref={isSelected ? activeVolunteerCardRef : undefined}
                          className={`volunteer-card transition-all duration-150 ${
                            isSelected
                              ? "!bg-[#FFFDF0] !border-black !shadow-[6px_6px_0_#111] ring-2 ring-[#FFC20E] !translate-x-[-1px] !translate-y-[-1px]"
                              : "hover:bg-[#FFF9DF] hover:shadow-[5px_5px_0_#111]"
                          }`}
                        >
                          {/* Card Summary Header (Clicking toggles expand/collapse) */}
                          <div
                            onClick={() => {
                              setSelectedVolunteerId((prev) => (prev === vol.id ? null : vol.id));
                            }}
                            className="cursor-pointer"
                          >
                            <div className="flex justify-between items-start gap-1">
                              <div>
                                <div className="student-name flex items-center gap-1.5">
                                  <span>{vol.name}</span>
                                  {isSelected && (
                                    <span className="text-[9px] bg-[#FFD600] text-black font-mono px-1 py-0.2 rounded border border-black font-black">
                                      EXPANDED
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#555] font-semibold mt-0.5 truncate font-mono">
                                  🎓 {vol.college}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[8px] font-mono bg-black text-[#FFC20E] px-1.5 py-0.5 rounded font-bold">
                                  LEADER
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVolunteerId((prev) => (prev === vol.id ? null : vol.id));
                                  }}
                                  className="text-[10px] font-mono font-black px-1.5 py-0.5 border border-black bg-white rounded hover:bg-gray-100 cursor-pointer"
                                  title={isSelected ? "Collapse card" : "Expand details"}
                                >
                                  {isSelected ? "▲" : "▼"}
                                </button>
                              </div>
                            </div>

                            {/* Med-level compact PV metrics */}
                            <div className="mt-2 pt-1.5 border-t border-black/15 grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                              <div className="bg-[#DDF5E6] border border-[#16834A] rounded px-1.5 py-0.5 flex justify-between items-center">
                                <span className="text-[#16834A] text-[9px] font-bold uppercase">PV Count:</span>
                                <span className="font-black text-xs text-[#16834A]">{vol.pvCount}</span>
                              </div>
                              <div className="bg-gray-100 border border-black rounded px-1.5 py-0.5 flex justify-between items-center">
                                <span className="text-[#555] text-[9px] font-bold uppercase">Assigned:</span>
                                <span className="font-black text-xs text-[#111]">{vol.pvAssigned}</span>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content: Visible when this volunteer is selected */}
                          {isSelected && (
                            <div className="mt-2.5 pt-2 border-t-2 border-black animate-in fade-in duration-150">
                              <div className="flex items-center justify-between mb-1.5 font-mono">
                                <span className="text-[9px] uppercase text-[#111] font-black tracking-wide">
                                  📍 Nearby Students ({nearbyStudentsForActiveVol.length})
                                </span>
                                <span className="text-[8px] text-green-700 font-bold bg-[#DDF5E6] px-1 py-0.2 rounded border border-[#16834A]">
                                  &le; 5 km reach
                                </span>
                              </div>

                              {/* Scrollable list of nearby students */}
                              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono">
                                {nearbyStudentsForActiveVol.map(({ student: s, dist }) => {
                                  const isStudentActive = selectedStudentId === s.id;
                                  return (
                                    <div
                                      key={s.id}
                                      onClick={() => {
                                        setSelectedStudentId((prev) => (prev === s.id ? null : s.id));
                                      }}
                                      className={`flex items-center justify-between p-1.5 rounded border-2 cursor-pointer transition-all ${
                                        isStudentActive
                                          ? "bg-[#FFD600] border-black font-black shadow-[2px_2px_0_#111] translate-x-1"
                                          : "bg-white hover:bg-[#FFF9DF] border-gray-300 hover:border-black"
                                      }`}
                                      title="Click to draw line & view student form on map"
                                    >
                                      <div className="flex items-center gap-1.5 truncate text-[11px]">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${
                                            s.opted === "Eng" ? "bg-[#2457C5]" : "bg-[#B85A12]"
                                          }`}
                                        />
                                        <span className="truncate font-sans font-bold">{s.name}</span>
                                        <span className="text-[9px] text-[#666]">({s.opted})</span>
                                      </div>

                                      <span
                                        className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded shrink-0 border ${
                                          dist <= 5.0
                                            ? "bg-[#DDF5E6] text-[#16834A] border-[#16834A]"
                                            : "bg-[#FFE9E5] text-[#D92D20] border-[#D92D20]"
                                        }`}
                                      >
                                        ⚡ {dist} km
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Expanded Card Footer Controls */}
                              <div className="mt-2.5 pt-2 border-t border-black/15 flex items-center justify-between font-mono text-[10px]">
                                <span className="text-[#666]">Near Reach: <b>{vol.nearToApplicants}</b></span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVolunteerId(null);
                                    setSelectedStudentId(null);
                                  }}
                                  className="px-2 py-0.5 bg-black text-[#FFC20E] rounded text-[9px] font-bold hover:bg-gray-800 cursor-pointer"
                                >
                                  Collapse ✕
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredVolunteers.length === 0 && (
                      <div className="p-4 text-center bg-white border border-dashed border-black/30 rounded-lg text-xs font-mono text-[#777]">
                        No volunteers match search.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* STICKY TAB SWITCHING BAR (ALWAYS IN VIEWPORT AT BOTTOM OF PANEL) */}
            <div className="shrink-0 p-2.5 bg-white/95 backdrop-blur-md border-t-2 border-black flex justify-center z-20">
              <nav
                aria-label="Sidebar Tabs"
                className="bg-[#F5F5F2] border-2 border-black rounded-full shadow-[2px_2px_0_#111] p-1 flex items-center gap-1"
              >
                <button
                  onClick={() => handleTabChange("summary")}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === "summary"
                      ? "bg-[#FFC20E] text-black border border-black shadow-[1px_1px_0_#111]"
                      : "text-[#555] hover:text-black border border-transparent"
                  }`}
                >
                  Summary
                </button>
                <span className="text-black/30 font-mono text-xs">|</span>
                <button
                  onClick={() => handleTabChange("students")}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === "students"
                      ? "bg-[#FFC20E] text-black border border-black shadow-[1px_1px_0_#111]"
                      : "text-[#555] hover:text-black border border-transparent"
                  }`}
                >
                  Students
                </button>
                <span className="text-black/30 font-mono text-xs">|</span>
                <button
                  onClick={() => handleTabChange("volunteers")}
                  className={`px-3 py-1 rounded-full font-mono text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === "volunteers"
                      ? "bg-[#FFC20E] text-black border border-black shadow-[1px_1px_0_#111]"
                      : "text-[#555] hover:text-black border border-transparent"
                  }`}
                >
                  Volunteers
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
