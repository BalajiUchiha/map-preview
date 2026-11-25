"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import {
  DISTRICTS,
  District,
  filterStudents,
  getNearbyStudents,
  getNearbyVolunteers,
} from "@/data/districts";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#FAF9F6] flex flex-col items-center justify-center gap-2">
      <div className="w-7 h-7 border-[3px] border-black border-t-[#FFE600] rounded-full animate-spin" />
      <span className="font-mono text-[11px] uppercase font-bold tracking-wider">
        Loading District Map...
      </span>
    </div>
  ),
});

type TabType = "summary" | "students" | "volunteers";
type SortType = "total_desc" | "name_asc" | "total_asc";

export default function MaatramApp() {
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [mapWidthPercent, setMapWidthPercent] = useState<number>(60);
  const [isDragging, setIsDragging] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [gridSort, setGridSort] = useState<SortType>("total_desc");

  // Focus selection
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);

  // Filters & Search
  const [studentCategoryFilter, setStudentCategoryFilter] = useState("all");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [volunteerSearchQuery, setVolunteerSearchQuery] = useState("");

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const activeVolunteerCardRef = useRef<HTMLDivElement>(null);
  const activeStudentCardRef = useRef<HTMLDivElement>(null);

  const handleSelectVolunteer = (id: string | null) => {
    setSelectedVolunteerId(id);
    if (id) setActiveTab("volunteers");
  };

  const handleSelectStudentFromMap = (id: string | null) => {
    setSelectedStudentId(id);
    if (id && !selectedVolunteerId) setActiveTab("students");
  };

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

  useEffect(() => {
    if (selectedStudentId && activeTab === "students") {
      const timer = setTimeout(() => {
        activeStudentCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [selectedStudentId, activeTab]);

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

  // Drag resize listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
      if (newPercent >= 25 && newPercent <= 78) {
        setMapWidthPercent(newPercent);
      }
    };
    const handleMouseUp = () => setIsDragging(false);

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

  // Statewide aggregate KPIs for Overview portal
  const stateTotals = useMemo(() => {
    let applicants = 0;
    let male = 0;
    let female = 0;
    let volunteers = 0;
    let pvAssigned = 0;
    let pvCompleted = 0;
    let nearReach = 0;

    for (const d of DISTRICTS) {
      applicants += d.totalApplicants;
      male += d.male;
      female += d.female;
      volunteers += d.volunteers.length;
      for (const v of d.volunteers) {
        pvAssigned += v.pvAssigned;
        pvCompleted += v.pvCount;
        nearReach += v.nearToApplicants;
      }
    }
    return {
      applicants,
      male,
      female,
      malePct: Math.round((male / applicants) * 100),
      volunteers,
      pvAssigned,
      pvCompleted,
      pvPct: Math.round((pvCompleted / pvAssigned) * 100),
      nearReach,
    };
  }, []);

  // Filtered and sorted districts for Overview
  const visibleDistricts = useMemo(() => {
    const q = gridSearch.toLowerCase().trim();
    const filtered = q
      ? DISTRICTS.filter((d) => d.name.toLowerCase().includes(q))
      : [...DISTRICTS];

    if (gridSort === "total_desc") {
      filtered.sort((a, b) => b.totalApplicants - a.totalApplicants);
    } else if (gridSort === "total_asc") {
      filtered.sort((a, b) => a.totalApplicants - b.totalApplicants);
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [gridSearch, gridSort]);

  const filteredStudents = useMemo(() => {
    if (!selectedDistrict) return [];
    return filterStudents(selectedDistrict.students, studentCategoryFilter, studentSearchQuery);
  }, [selectedDistrict, studentCategoryFilter, studentSearchQuery]);

  const filteredVolunteers = useMemo(() => {
    if (!selectedDistrict) return [];
    const list = selectedDistrict.volunteers;
    if (!volunteerSearchQuery.trim()) return list;
    const q = volunteerSearchQuery.toLowerCase().trim();
    return list.filter(
      (v) => v.name.toLowerCase().includes(q) || v.college.toLowerCase().includes(q)
    );
  }, [selectedDistrict, volunteerSearchQuery]);

  const nearbyStudentsForActiveVol = useMemo(() => {
    if (!selectedDistrict || !selectedVolunteerId) {
      return { displayList: [], usedFallback: false };
    }
    const currentVol = selectedDistrict.volunteers.find((v) => v.id === selectedVolunteerId);
    if (!currentVol) return { displayList: [], usedFallback: false };
    return getNearbyStudents(currentVol, selectedDistrict.students);
  }, [selectedDistrict, selectedVolunteerId]);

  const nearbyVolunteersForActiveStudent = useMemo(() => {
    if (!selectedDistrict || !selectedStudentId) {
      return { displayList: [], usedFallback: false };
    }
    const currentStudent = selectedDistrict.students.find((s) => s.id === selectedStudentId);
    if (!currentStudent) return { displayList: [], usedFallback: false };
    return getNearbyVolunteers(currentStudent, selectedDistrict.volunteers);
  }, [selectedDistrict, selectedStudentId]);

  // Real metrics derived for Summary tab of selected district
  const districtMetrics = useMemo(() => {
    if (!selectedDistrict) return null;
    const pvAssigned = selectedDistrict.volunteers.reduce((acc, v) => acc + v.pvAssigned, 0);
    const pvCompleted = selectedDistrict.volunteers.reduce((acc, v) => acc + v.pvCount, 0);
    const nearReach = selectedDistrict.volunteers.reduce((acc, v) => acc + v.nearToApplicants, 0);
    const alertStudents = selectedDistrict.students.filter(
      (s) => s.familyIncome > 100000 || s.ownHouse === "Yes"
    ).length;
    const eligibleStudents = selectedDistrict.students.length - alertStudents;
    const engStudents = selectedDistrict.students.filter((s) => s.opted === "Eng").length;
    const artsStudents = selectedDistrict.students.length - engStudents;

    return {
      pvAssigned,
      pvCompleted,
      pvPct: pvAssigned > 0 ? Math.round((pvCompleted / pvAssigned) * 100) : 0,
      nearReach,
      alertStudents,
      eligibleStudents,
      eligiblePct: Math.round((eligibleStudents / selectedDistrict.students.length) * 100),
      engEst: Math.round(selectedDistrict.totalApplicants * (engStudents / selectedDistrict.students.length)),
      artsEst: Math.round(selectedDistrict.totalApplicants * (artsStudents / selectedDistrict.students.length)),
      engPct: Math.round((engStudents / selectedDistrict.students.length) * 100),
      artsPct: Math.round((artsStudents / selectedDistrict.students.length) * 100),
    };
  }, [selectedDistrict]);

  const handleCardKeyDown = (e: KeyboardEvent, onActivate: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FAF9F6] text-black overflow-hidden">
      {/* Topbar */}
      <header className="h-[58px] shrink-0 bg-[#FFE600] border-b-[3px] border-black px-4 md:px-6 flex justify-between items-center gap-3 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black text-[#FFE600] rounded-[2px] flex items-center justify-center font-mono font-bold text-sm shadow-[2px_2px_0_#FFF]">
            M
          </div>
          <div>
            <div className="font-heading font-bold text-base md:text-lg tracking-tight leading-none flex items-center gap-2">
              MAATRAM
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-black text-[#FFE600] rounded-[2px]">
                ADMISSIONS
              </span>
            </div>
            <div className="text-[9px] font-mono tracking-widest uppercase text-black/80 font-semibold mt-0.5">
              Tamil Nadu State Operations
            </div>
          </div>
        </div>

        {selectedDistrict ? (
          <button
            type="button"
            onClick={() => {
              setSelectedDistrict(null);
              setSelectedStudentId(null);
              setSelectedVolunteerId(null);
            }}
            className="brutal-btn bg-white hover:bg-black hover:text-[#FFE600] px-3 py-1.5 text-xs font-mono"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            All Districts
          </button>
        ) : (
          <div className="text-xs font-mono font-bold border-2 border-black bg-white px-2.5 py-1 rounded-[2px] shadow-[2px_2px_0_#000]">
            {DISTRICTS.length} Districts
          </div>
        )}
      </header>

      {/* SCREEN 1: EXECUTIVE OPERATIONS OVERVIEW */}
      {!selectedDistrict ? (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl w-full mx-auto space-y-5">
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b-2 border-black">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-black text-[#FFE600] px-2.5 py-0.5 rounded-[2px] font-mono text-[10px] font-bold tracking-wider mb-1.5">
                OPERATIONS PORTAL
              </div>
              <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight leading-none">
                Tamil Nadu District Directory
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex items-center">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="absolute left-2.5 pointer-events-none text-black/60"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Search district..."
                  value={gridSearch}
                  onChange={(e) => setGridSearch(e.target.value)}
                  className="brutal-input pl-8 pr-7 py-1.5 text-xs w-48 sm:w-56"
                  aria-label="Search district"
                />
                {gridSearch && (
                  <button
                    type="button"
                    onClick={() => setGridSearch("")}
                    className="absolute right-2 text-[11px] font-mono font-bold text-black/70 hover:text-black cursor-pointer"
                    aria-label="Clear district search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-white border-2 border-black p-0.5 rounded-[2px] shadow-[2px_2px_0_#000]">
                {(
                  [
                    ["total_desc", "Most Appl."],
                    ["name_asc", "A–Z"],
                    ["total_asc", "Fewest"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGridSort(key)}
                    className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-[1px] cursor-pointer transition-colors ${
                      gridSort === key
                        ? "bg-[#FFE600] text-black border border-black"
                        : "text-black/70 hover:text-black border border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Executive Summary Strip */}
          <section aria-label="Statewide metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="brutal-card p-3.5 bg-[#FFE600]">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-black/80">
                <span>State Applicants</span>
                <span className="border border-black bg-white px-1.5 py-0.5 rounded-[2px]">
                  {visibleDistricts.length}/{DISTRICTS.length}
                </span>
              </div>
              <div className="font-mono font-bold text-2xl md:text-3xl tracking-tight mt-1 tabular-nums">
                {stateTotals.applicants.toLocaleString()}
              </div>
              <div className="text-[11px] font-mono text-black/80 mt-1">
                Avg {Math.round(stateTotals.applicants / DISTRICTS.length).toLocaleString()} / district
              </div>
            </div>

            <div className="brutal-card p-3.5 flex flex-col gap-2">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black/60">Gender Split</span>
                <span className="text-[10px] font-mono font-bold border border-black bg-[#F3F1EA] px-1.5 py-0.5 rounded-[2px]">
                  {DISTRICTS.length} districts
                </span>
              </div>

              {/* M / F side-by-side value blocks */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#EFF6FF] border-[1.5px] border-[#2563EB] p-2 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-[#2563EB] border border-black inline-block shrink-0" />
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#1D4ED8]">Male</span>
                  </div>
                  <div className="font-mono font-bold text-lg leading-none tabular-nums text-black">
                    {stateTotals.male.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono font-bold text-[#2563EB] border border-[#2563EB] bg-white px-1 py-0.5 self-start rounded-[2px]">
                    {stateTotals.malePct}%
                  </div>
                </div>

                <div className="bg-[#FFFBEB] border-[1.5px] border-[#F59E0B] p-2 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-[#F59E0B] border border-black inline-block shrink-0" />
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#92400E]">Female</span>
                  </div>
                  <div className="font-mono font-bold text-lg leading-none tabular-nums text-black">
                    {stateTotals.female.toLocaleString()}
                  </div>
                  <div className="text-[9px] font-mono font-bold text-[#B45309] border border-[#F59E0B] bg-white px-1 py-0.5 self-start rounded-[2px]">
                    {100 - stateTotals.malePct}%
                  </div>
                </div>
              </div>

              {/* Thick segmented ratio bar */}
              <div className="w-full h-3 bg-[#F3F1EA] border-2 border-black flex overflow-hidden">
                <div
                  style={{ width: `${stateTotals.malePct}%` }}
                  className="bg-[#2563EB] h-full border-r-2 border-black transition-all duration-500"
                />
                <div
                  style={{ width: `${100 - stateTotals.malePct}%` }}
                  className="bg-[#F59E0B] h-full"
                />
              </div>
            </div>

            <div className="brutal-card p-3.5">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-black/70">
                <span>PV Progress</span>
                <span className="bg-[#DDF5E6] text-[#14532D] border border-black px-1.5 rounded-[2px]">
                  {stateTotals.pvPct}%
                </span>
              </div>
              <div className="font-mono font-bold text-lg md:text-xl tracking-tight mt-1 tabular-nums">
                {stateTotals.pvCompleted.toLocaleString()}{" "}
                <span className="text-xs font-normal text-black/60">/ {stateTotals.pvAssigned.toLocaleString()}</span>
              </div>
              <div className="w-full h-2.5 bg-[#F3F1EA] border-[1.5px] border-black mt-2 overflow-hidden">
                <div style={{ width: `${stateTotals.pvPct}%` }} className="bg-[#4ADE80] h-full border-r border-black" />
              </div>
            </div>

            <div className="brutal-card p-3.5">
              <div className="text-[10px] font-mono font-bold uppercase text-black/70">
                Active Volunteers
              </div>
              <div className="font-mono font-bold text-2xl md:text-3xl tracking-tight mt-1 tabular-nums">
                {stateTotals.volunteers}
              </div>
              <div className="text-[11px] font-mono text-[#16834A] font-bold mt-1">
                {stateTotals.nearReach} sample matches ≤ 5 km
              </div>
            </div>
          </section>

          {/* District Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-12">
            {visibleDistricts.map((district) => {
              const maleRatio = Math.round((district.male / district.totalApplicants) * 100);
              const nearSum = district.volunteers.reduce((sum, v) => sum + v.nearToApplicants, 0);
              const selectDist = () => {
                setSelectedDistrict(district);
                setActiveTab("summary");
                setSelectedStudentId(null);
                setSelectedVolunteerId(null);
              };

              return (
                <div
                  key={district.name}
                  role="button"
                  tabIndex={0}
                  onClick={selectDist}
                  onKeyDown={(e) => handleCardKeyDown(e, selectDist)}
                  className="brutal-card brutal-card-hover p-3.5 cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <h2 className="font-heading font-bold text-lg tracking-tight text-black truncate">
                          {district.name}
                        </h2>
                        <div className="font-mono text-[10px] text-black/60 mt-0.5">
                          {district.volunteers.length} PVs · {nearSum} near reach
                        </div>
                      </div>

                      <span className="w-7 h-7 rounded-[2px] border-2 border-black bg-[#FFE600] flex items-center justify-center font-mono font-bold text-xs group-hover:bg-black group-hover:text-[#FFE600] shrink-0 transition-colors">
                        ↗
                      </span>
                    </div>

                    <div className="mt-3 bg-[#FAF9F6] border-[1.5px] border-black p-2.5 flex items-end justify-between">
                      <div>
                        <div className="text-[9px] font-mono uppercase tracking-wider text-black/60 font-bold">
                          Applicants
                        </div>
                        <div className="font-mono font-bold text-2xl tracking-tight text-black tabular-nums leading-tight">
                          {district.totalApplicants.toLocaleString()}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-white border border-black px-1.5 py-0.5 rounded-[2px]">
                        {((district.totalApplicants / stateTotals.applicants) * 100).toFixed(1)}% state
                      </span>
                    </div>
                  </div>

                  {/* Anti-fatigue flat footer with M/F ratio bar */}
                  <div className="mt-3 pt-2.5 border-t-[1.5px] border-black space-y-1.5 font-mono text-[11px]">
                    <div className="w-full h-1.5 bg-[#F3F1EA] border border-black flex overflow-hidden">
                      <div style={{ width: `${maleRatio}%` }} className="bg-[#2563EB] h-full" />
                      <div style={{ width: `${100 - maleRatio}%` }} className="bg-[#F59E0B] h-full" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#2563EB] border border-black inline-block" />
                        <span className="text-black/70">M</span>
                        <span className="font-bold tabular-nums">{district.male}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-[#F59E0B] border border-black inline-block" />
                        <span className="text-black/70">F</span>
                        <span className="font-bold tabular-nums">{district.female}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visibleDistricts.length === 0 && (
              <div className="col-span-full brutal-card p-8 text-center font-mono text-xs text-black/70">
                No districts match &ldquo;{gridSearch}&rdquo;.
              </div>
            )}
          </div>
        </main>
      ) : (
        /* SCREEN 2: SPLIT VIEWPORT (MAP + INSPECTOR PANEL) */
        <div
          ref={splitContainerRef}
          className="flex-1 flex flex-col md:flex-row overflow-hidden relative"
        >
          {/* Map Pane */}
          <div
            style={{ "--map-w": `${mapWidthPercent}%` } as CSSProperties}
            className="w-full md:w-[var(--map-w)] h-[42vh] md:h-full relative overflow-hidden shrink-0 border-b-2 md:border-b-0 border-black"
          >
            <DistrictMap
              district={selectedDistrict}
              students={selectedDistrict.students}
              volunteers={selectedDistrict.volunteers}
              selectedStudentId={selectedStudentId}
              selectedVolunteerId={selectedVolunteerId}
              onSelectStudent={handleSelectStudentFromMap}
              onSelectVolunteer={handleSelectVolunteer}
            />
          </div>

          {/* Desktop Drag Divider */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            className="hidden md:flex w-2.5 bg-black hover:bg-[#FFE600] cursor-col-resize items-center justify-center z-30 transition-colors select-none group"
            title="Drag to resize map & panel"
          >
            <div className="w-1 h-8 rounded-full bg-white group-hover:bg-black pointer-events-none" />
          </div>

          {/* Right Sidebar Inspector */}
          <div className="flex-1 flex flex-col h-full bg-[#FAF9F6] overflow-hidden md:min-w-[300px]">
            {/* District Panel Header */}
            <div className="p-3 bg-white border-b-2 border-black shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-black/60 font-bold">
                    District Operations
                  </div>
                  <h2 className="font-heading text-lg md:text-xl font-bold tracking-tight text-black leading-tight">
                    {selectedDistrict.name}
                  </h2>
                </div>

                <div className="bg-[#FFE600] border-2 border-black rounded-[2px] px-2.5 py-1 text-right shadow-[2px_2px_0_#000]">
                  <span className="text-[9px] font-mono uppercase text-black/70 mr-1.5 font-bold">
                    Total
                  </span>
                  <span className="font-mono font-bold text-sm tabular-nums">
                    {selectedDistrict.totalApplicants.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span className="px-1.5 py-0.5 bg-[#E5EDFF] border border-black rounded-[2px] font-bold text-[#1E40AF]">
                  M: {selectedDistrict.male}
                </span>
                <span className="px-1.5 py-0.5 bg-[#FFF0D9] border border-black rounded-[2px] font-bold text-[#9A3412]">
                  F: {selectedDistrict.female}
                </span>
                <span className="px-1.5 py-0.5 bg-[#DDF5E6] border border-black rounded-[2px] font-bold text-[#14532D]">
                  {selectedDistrict.volunteers.length} PVs
                </span>
                <span className="text-black/60 ml-auto text-[9px] font-bold uppercase">
                  Pan Locked
                </span>
              </div>
            </div>

            {/* Sticky Active Selection Cue for New Users */}
            {(selectedStudentId || selectedVolunteerId) && (
              <div className="px-3 py-1.5 bg-[#FFE600] border-b-2 border-black flex items-center justify-between gap-2 font-mono text-[10px] shrink-0">
                <span className="font-bold text-black truncate">
                  {selectedStudentId
                    ? `Selected: ${selectedDistrict.students.find((s) => s.id === selectedStudentId)?.name ?? "Student"}`
                    : `Selected: ${selectedDistrict.volunteers.find((v) => v.id === selectedVolunteerId)?.name ?? "Volunteer"}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentId && activeTab !== "students") {
                      setActiveTab("students");
                    } else if (selectedVolunteerId && activeTab !== "volunteers") {
                      setActiveTab("volunteers");
                    } else if (selectedStudentId) {
                      activeStudentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    } else {
                      activeVolunteerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }
                  }}
                  className="bg-black text-[#FFE600] px-2 py-0.5 rounded-[2px] font-bold cursor-pointer shrink-0 hover:bg-neutral-800"
                >
                  View Card ↓
                </button>
              </div>
            )}

            {/* Scrollable Tab Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* TAB 1: SUMMARY */}
              {activeTab === "summary" && districtMetrics && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="brutal-card p-3">
                      <div className="text-[10px] font-mono text-black/60 uppercase font-bold">
                        Engineering
                      </div>
                      <div className="font-mono font-bold text-xl text-[#1E40AF] mt-0.5 tabular-nums">
                        {districtMetrics.engEst.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-black/70 font-bold mt-0.5">
                        {districtMetrics.engPct}% of plotted sample
                      </div>
                    </div>

                    <div className="brutal-card p-3">
                      <div className="text-[10px] font-mono text-black/60 uppercase font-bold">
                        Arts &amp; Science
                      </div>
                      <div className="font-mono font-bold text-xl text-[#9A3412] mt-0.5 tabular-nums">
                        {districtMetrics.artsEst.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono text-black/70 font-bold mt-0.5">
                        {districtMetrics.artsPct}% of plotted sample
                      </div>
                    </div>
                  </div>

                  {/* Eligibility Distribution Card (Flat rows inside) */}
                  <div className="brutal-card p-3">
                    <div className="flex items-center justify-between pb-2 border-b-[1.5px] border-black">
                      <span className="font-bold text-[10px] uppercase font-mono">
                        Sample Eligibility ({selectedDistrict.students.length} Pins)
                      </span>
                      <span className="text-[9px] font-mono bg-[#DDF5E6] text-[#14532D] border border-black px-1.5 py-0.5 rounded-[2px] font-bold">
                        {districtMetrics.eligiblePct}% Eligible
                      </span>
                    </div>

                    <div className="w-full bg-[#FAF9F6] border-[1.5px] border-black h-3 mt-2.5 overflow-hidden flex">
                      <div
                        style={{ width: `${districtMetrics.eligiblePct}%` }}
                        className="bg-[#4ADE80] h-full border-r border-black"
                      />
                      <div
                        style={{ width: `${100 - districtMetrics.eligiblePct}%` }}
                        className="bg-[#DC2626] h-full"
                      />
                    </div>

                    <div className="mt-2.5 divide-y-[1.5px] divide-black/15 font-mono text-[11px]">
                      <div className="py-1.5 flex justify-between items-center">
                        <span className="text-black/75">Eligible (≤ 1L &amp; No House)</span>
                        <span className="font-bold text-[#14532D] tabular-nums">
                          {districtMetrics.eligibleStudents} pins
                        </span>
                      </div>
                      <div className="py-1.5 flex justify-between items-center">
                        <span className="text-[#B91C1C] font-semibold">Alert (&gt; 1L or Own House)</span>
                        <span className="income-red-tag tabular-nums">
                          {districtMetrics.alertStudents} pins
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PV Verification Status */}
                  <div className="brutal-card p-3">
                    <div className="flex items-center justify-between pb-2 border-b-[1.5px] border-black">
                      <span className="font-bold text-[10px] uppercase font-mono">
                        PV Verification Progress
                      </span>
                      <span className="text-[9px] font-mono bg-[#FFE600] border border-black px-1.5 py-0.5 rounded-[2px] font-bold">
                        {districtMetrics.pvPct}% Done
                      </span>
                    </div>

                    <div className="w-full bg-[#FAF9F6] border-[1.5px] border-black h-2.5 mt-2.5 overflow-hidden">
                      <div
                        style={{ width: `${districtMetrics.pvPct}%` }}
                        className="bg-[#4ADE80] h-full border-r border-black"
                      />
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 border-[1.5px] border-black divide-x-[1.5px] divide-black text-center font-mono text-[11px]">
                      <div className="p-2 bg-white">
                        <div className="text-[9px] text-black/60 uppercase">Assigned</div>
                        <div className="font-bold text-sm mt-0.5 tabular-nums">
                          {districtMetrics.pvAssigned}
                        </div>
                      </div>
                      <div className="p-2 bg-[#DDF5E6]">
                        <div className="text-[9px] text-[#14532D] uppercase">Completed</div>
                        <div className="font-bold text-sm text-[#14532D] mt-0.5 tabular-nums">
                          {districtMetrics.pvCompleted}
                        </div>
                      </div>
                      <div className="p-2 bg-[#FFFBEB]">
                        <div className="text-[9px] text-black/70 uppercase">≤5km Reach</div>
                        <div className="font-bold text-sm text-black mt-0.5 tabular-nums">
                          {districtMetrics.nearReach}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: STUDENTS */}
              {activeTab === "students" && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1.5 bg-white p-2 border-2 border-black rounded-[2px] shadow-[2px_2px_0_#000]">
                    <select
                      value={studentCategoryFilter}
                      onChange={(e) => handleStudentFilterChange(e.target.value)}
                      className="border-[1.5px] border-black rounded-[2px] px-2 py-1 text-[11px] font-mono bg-white outline-none cursor-pointer w-32 shrink-0"
                      aria-label="Filter students by category"
                    >
                      <option value="all">All ({selectedDistrict.students.length})</option>
                      <option value="eng">Stream: Eng</option>
                      <option value="arts">Stream: Arts</option>
                      <option value="male">Gender: Male</option>
                      <option value="female">Gender: Female</option>
                      <option value="both">Parents: Both</option>
                      <option value="single">Parents: Single</option>
                      <option value="orphan">Parents: Orphan</option>
                      <option value="above_1lakh">Alert: Income &gt; 1L</option>
                      <option value="own_house">Alert: Own House</option>
                      <option value="below_1lakh">Income: ≤ 1L</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Name or marks..."
                      value={studentSearchQuery}
                      onChange={(e) => handleStudentSearchChange(e.target.value)}
                      className="flex-1 border-[1.5px] border-black rounded-[2px] px-2 py-1 text-[11px] outline-none min-w-[110px]"
                      aria-label="Search students"
                    />

                    {(studentSearchQuery || studentCategoryFilter !== "all") && (
                      <button
                        type="button"
                        onClick={() => {
                          setStudentSearchQuery("");
                          setStudentCategoryFilter("all");
                          setSelectedStudentId(null);
                          setSelectedVolunteerId(null);
                        }}
                        className="brutal-btn bg-[#FAF9F6] px-2 py-1 text-[10px] font-mono shrink-0"
                        aria-label="Reset student filters"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="text-[10px] font-mono font-bold text-black/60 px-0.5">
                    Showing {filteredStudents.length} of {selectedDistrict.students.length} applicants
                  </div>

                  <div className="space-y-2.5">
                    {filteredStudents.map((student) => {
                      const isHighIncome = student.familyIncome > 100000;
                      const hasOwnHouse = student.ownHouse === "Yes";
                      const makeWholeCardRed = isHighIncome || hasOwnHouse;
                      const isSelected = selectedStudentId === student.id;
                      const toggleStudent = () => {
                        setSelectedStudentId((prev) => {
                          const next = prev === student.id ? null : student.id;
                          if (!next) setSelectedVolunteerId(null);
                          return next;
                        });
                      };

                      const isMale = student.gender === "Male";
                      const genderStripe = isMale
                        ? "border-l-[5px] border-l-[#2563EB]"
                        : "border-l-[5px] border-l-[#EC4899]";
                      return (
                        <div
                          key={student.id}
                          ref={isSelected ? activeStudentCardRef : undefined}
                          role="button"
                          tabIndex={0}
                          onClick={toggleStudent}
                          onKeyDown={(e) => handleCardKeyDown(e, toggleStudent)}
                          className={`student-card ${genderStripe} ${makeWholeCardRed ? "high-income" : ""} ${
                            isSelected
                              ? "card-just-focused !border-black !translate-x-[-2px] !translate-y-[-2px] !shadow-[6px_6px_0_#000] ring-2 ring-[#FFE600]"
                              : ""
                          }`}
                        >
                          <div
                            className={`flex justify-between items-start gap-1.5 -mx-3 -mt-3 px-3 pt-2.5 pb-2 mb-2 border-b-[1.5px] border-black ${
                              isMale ? "bg-[#EFF6FF]" : "bg-[#FDF2F8]"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="student-name flex items-center gap-1.5 flex-wrap">
                                <span>{student.name}</span>
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] border border-black text-white ${
                                    isMale ? "bg-[#2563EB]" : "bg-[#EC4899]"
                                  }`}
                                >
                                  {isMale ? "BOY" : "GIRL"}
                                </span>
                                {isSelected && (
                                  <span className="text-[9px] bg-black text-[#FFE600] font-mono px-1.5 py-0.5 rounded-[2px]">
                                    VIEWING
                                  </span>
                                )}
                              </div>
                              <div className="student-id">{student.id}</div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="badge-stream">{student.opted}</span>
                              <span className="badge-marks tabular-nums">{student.marks}/600</span>
                            </div>
                          </div>

                          <div className="student-card-footer">
                            <div className="footer-item">
                              <span className="text-black/60">Gender:</span>
                              <b className="text-black">{student.gender}</b>
                            </div>
                            <div className="footer-item justify-end">
                              <span className="text-black/60">Parents:</span>
                              <b className="text-black">{student.parents}</b>
                            </div>
                            <div className="footer-item">
                              <span className="text-black/60">Income:</span>
                              {isHighIncome ? (
                                <span className="income-red-tag tabular-nums">
                                  ₹{student.familyIncome.toLocaleString()}
                                </span>
                              ) : (
                                <b className="text-black tabular-nums">
                                  ₹{student.familyIncome.toLocaleString()}
                                </b>
                              )}
                            </div>
                            <div className="footer-item justify-end">
                              <span className="text-black/60">House:</span>
                              {hasOwnHouse ? (
                                <span className="income-red-tag">Yes</span>
                              ) : (
                                <b className="text-[#14532D]">No</b>
                              )}
                            </div>
                          </div>

                          {/* Nearest Volunteers Drawer with "Show in map" */}
                          {isSelected && (
                            <div
                              className="mt-3 pt-2.5 border-t-2 border-black"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between mb-2 font-mono bg-black text-[#FFE600] px-2.5 py-1.5 rounded-[2px] border border-black">
                                <span className="text-[11px] uppercase font-bold tracking-wide">
                                  Nearest Volunteers ({nearbyVolunteersForActiveStudent.displayList.length})
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] border border-black ${
                                    nearbyVolunteersForActiveStudent.usedFallback
                                      ? "text-[#991B1B] bg-[#FFE9E5]"
                                      : "text-[#14532D] bg-[#DDF5E6]"
                                  }`}
                                >
                                  {nearbyVolunteersForActiveStudent.usedFallback ? "Closest 3" : "≤ 5 km"}
                                </span>
                              </div>

                              <div className="max-h-44 overflow-y-auto border-[1.5px] border-black divide-y-[1.5px] divide-black bg-white font-mono">
                                {nearbyVolunteersForActiveStudent.displayList.map(({ volunteer: v, dist }) => {
                                  const isShownInMap = selectedVolunteerId === v.id;
                                  return (
                                    <div
                                      key={v.id}
                                      className={`flex items-center justify-between gap-2 px-2.5 py-2 ${
                                        isShownInMap ? "bg-[#FFFDF2]" : "bg-white"
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div className="font-sans font-bold text-[11px] text-black truncate">
                                          {v.name}
                                        </div>
                                        <div className="text-[9px] text-black/60 truncate">
                                          {dist} km away
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedStudentId(student.id);
                                          setSelectedVolunteerId(isShownInMap ? null : v.id);
                                        }}
                                        className={`px-2 py-1 rounded-[2px] border-[1.5px] border-black text-[10px] font-mono font-bold shrink-0 cursor-pointer transition-colors ${
                                          isShownInMap
                                            ? "bg-black text-[#FFE600]"
                                            : "bg-[#FFE600] text-black hover:bg-black hover:text-[#FFE600]"
                                        }`}
                                      >
                                        {isShownInMap ? "Showing" : "Show in map"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredStudents.length === 0 && (
                      <div className="brutal-card p-6 text-center text-xs font-mono text-black/60">
                        No students match current filters.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: VOLUNTEERS */}
              {activeTab === "volunteers" && (
                <div className="space-y-2.5">
                  <div className="flex gap-1.5 bg-white p-2 border-2 border-black rounded-[2px] shadow-[2px_2px_0_#000]">
                    <input
                      type="text"
                      placeholder="Search volunteer or college..."
                      value={volunteerSearchQuery}
                      onChange={(e) => {
                        setVolunteerSearchQuery(e.target.value);
                        setSelectedVolunteerId(null);
                        setSelectedStudentId(null);
                      }}
                      className="flex-1 border-[1.5px] border-black rounded-[2px] px-2 py-1 text-[11px] outline-none"
                      aria-label="Search volunteers"
                    />
                    {volunteerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setVolunteerSearchQuery("");
                          setSelectedVolunteerId(null);
                          setSelectedStudentId(null);
                        }}
                        className="brutal-btn bg-[#FAF9F6] px-2 py-1 text-[10px] font-mono"
                        aria-label="Clear volunteer search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {filteredVolunteers.map((vol) => {
                      const isSelected = selectedVolunteerId === vol.id;
                      const toggleVol = () =>
                        setSelectedVolunteerId((prev) => (prev === vol.id ? null : vol.id));

                      return (
                        <div
                          key={vol.id}
                          ref={isSelected ? activeVolunteerCardRef : undefined}
                          className={`volunteer-card ${
                            isSelected
                              ? "card-just-focused !bg-[#FFFDF2] !shadow-[6px_6px_0_#000] ring-2 ring-[#FFE600]"
                              : ""
                          }`}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggleVol}
                            onKeyDown={(e) => handleCardKeyDown(e, toggleVol)}
                            className="cursor-pointer"
                          >
                            <div className="flex justify-between items-start gap-1.5">
                              <div className="min-w-0">
                                <div className="student-name flex items-center gap-1.5 flex-wrap">
                                  <span>{vol.name}</span>
                                  {isSelected && (
                                    <span className="text-[9px] bg-[#FFE600] text-black font-mono px-1.5 py-0.5 rounded-[2px] border border-black font-bold">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-black/70 font-semibold mt-0.5 truncate font-mono flex items-center gap-1">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    className="shrink-0"
                                  >
                                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                                  </svg>
                                  <span className="truncate">{vol.college}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] font-mono bg-black text-[#FFE600] px-1.5 py-0.5 rounded-[2px] font-bold">
                                  LEADER
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleVol();
                                  }}
                                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 border-[1.5px] border-black bg-white rounded-[2px] hover:bg-[#FFE600] cursor-pointer"
                                  aria-label={isSelected ? "Collapse volunteer drawer" : "Expand volunteer drawer"}
                                >
                                  {isSelected ? "▲" : "▼"}
                                </button>
                              </div>
                            </div>

                            {/* Flat 3-column anti-fatigue PV metrics bar */}
                            <div className="mt-2.5 grid grid-cols-3 border-[1.5px] border-black divide-x-[1.5px] divide-black font-mono text-[10px]">
                              <div className="bg-[#DDF5E6] px-2 py-1 flex justify-between items-center">
                                <span className="text-[#14532D] text-[9px] font-bold uppercase">PV</span>
                                <span className="font-bold text-xs text-[#14532D] tabular-nums">{vol.pvCount}</span>
                              </div>
                              <div className="bg-white px-2 py-1 flex justify-between items-center">
                                <span className="text-black/60 text-[9px] font-bold uppercase">Asgn</span>
                                <span className="font-bold text-xs text-black tabular-nums">{vol.pvAssigned}</span>
                              </div>
                              <div className="bg-[#FFFBEB] px-2 py-1 flex justify-between items-center">
                                <span className="text-black/60 text-[9px] font-bold uppercase">≤5km</span>
                                <span className="font-bold text-xs text-black tabular-nums">{vol.nearToApplicants}</span>
                              </div>
                            </div>
                          </div>

                          {/* Expandable Drawer (Flat rows with 1.5px black dividers — zero shadow clutter) */}
                          {isSelected && (
                            <div className="mt-3 pt-2.5 border-t-2 border-black">
                              <div className="flex items-center justify-between mb-2 font-mono bg-black text-[#FFE600] px-2.5 py-1.5 rounded-[2px] border border-black">
                                <span className="text-[11px] uppercase font-bold tracking-wide">
                                  Nearby Students ({nearbyStudentsForActiveVol.displayList.length})
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[2px] border border-black ${
                                    nearbyStudentsForActiveVol.usedFallback
                                      ? "text-[#991B1B] bg-[#FFE9E5]"
                                      : "text-[#14532D] bg-[#DDF5E6]"
                                  }`}
                                >
                                  {nearbyStudentsForActiveVol.usedFallback ? "Closest 4" : "≤ 5 km reach"}
                                </span>
                              </div>

                              <div className="max-h-48 overflow-y-auto border-[1.5px] border-black divide-y-[1.5px] divide-black bg-white font-mono">
                                {nearbyStudentsForActiveVol.displayList.map(({ student: s, dist }) => {
                                  const isStudentActive = selectedStudentId === s.id;
                                  const toggleNearbyStudent = () => {
                                    setSelectedStudentId((prev) => (prev === s.id ? null : s.id));
                                  };
                                  return (
                                    <div
                                      key={s.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={toggleNearbyStudent}
                                      onKeyDown={(e) => handleCardKeyDown(e, toggleNearbyStudent)}
                                      className={`flex items-center justify-between px-2.5 py-2 cursor-pointer transition-colors ${
                                        isStudentActive
                                          ? "bg-[#FFE600] font-bold"
                                          : "bg-white hover:bg-[#FFFDF2]"
                                      }`}
                                      title="Inspect pair distance & student application"
                                    >
                                      <div className="flex items-center gap-2 truncate text-[11px]">
                                        <span
                                          className={`w-2.5 h-2.5 border border-black shrink-0 ${
                                            s.opted === "Eng" ? "bg-[#2563EB]" : "bg-[#F59E0B]"
                                          }`}
                                        />
                                        <span className="truncate font-sans font-bold text-black">
                                          {s.name}
                                        </span>
                                        <span className="text-[9px] text-black/60">{s.opted}</span>
                                      </div>

                                      <span
                                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] shrink-0 border border-black tabular-nums ${
                                          dist <= 5.0
                                            ? "bg-[#DDF5E6] text-[#14532D]"
                                            : "bg-[#FFE9E5] text-[#991B1B]"
                                        }`}
                                      >
                                        {dist} km
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-2.5 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVolunteerId(null);
                                    setSelectedStudentId(null);
                                  }}
                                  className="px-2.5 py-1 bg-black text-[#FFE600] rounded-[2px] text-[10px] font-mono font-bold hover:bg-neutral-800 cursor-pointer"
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
                      <div className="brutal-card p-6 text-center text-xs font-mono text-black/60">
                        No volunteers match search.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Tab Switcher */}
            <div className="shrink-0 p-2.5 bg-white border-t-2 border-black flex justify-center z-20">
              <nav
                aria-label="Sidebar Tabs"
                className="bg-[#FAF9F6] border-2 border-black rounded-[2px] shadow-[3px_3px_0_#000] p-1 flex items-center gap-1"
              >
                {(
                  [
                    ["summary", "Summary"],
                    ["students", `Students (${selectedDistrict.students.length})`],
                    ["volunteers", `Volunteers (${selectedDistrict.volunteers.length})`],
                  ] as const
                ).map(([tabKey, label]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => handleTabChange(tabKey)}
                    className={`px-3 py-1 rounded-[1px] font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                      activeTab === tabKey
                        ? "bg-[#FFE600] text-black border-[1.5px] border-black shadow-[1px_1px_0_#000]"
                        : "text-black/70 hover:text-black border-[1.5px] border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
