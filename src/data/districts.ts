export interface Student {
  id: string;
  name: string;
  gender: "Male" | "Female";
  marks: number;
  opted: "Eng" | "Arts";
  parents: "Both" | "Single" | "Orphan";
  familyIncome: number;
  ownHouse: "Yes" | "No"; // If Yes -> whole card red
  lat: number;
  lng: number;
}

export interface Volunteer {
  id: string;
  name: string;
  college: string;
  pvCount: number;
  pvAssigned: number;
  nearToApplicants: number;
  lat: number;
  lng: number;
}

export interface District {
  name: string;
  totalApplicants: number;
  male: number;
  female: number;
  lat: number;
  lng: number;
  students: Student[];
  volunteers: Volunteer[];
}

export interface NearbyStudent {
  student: Student;
  dist: number;
}

/** Returns nearby students sorted by distance, plus closest-4 fallback when none sit within maxKm. */
export function getNearbyStudents(
  volunteer: Pick<Volunteer, "lat" | "lng">,
  students: Student[],
  maxKm = 5.0
): { withinRadius: NearbyStudent[]; displayList: NearbyStudent[]; usedFallback: boolean } {
  const allSorted = students
    .map((student) => ({
      student,
      dist: getDistanceKm(volunteer.lat, volunteer.lng, student.lat, student.lng),
    }))
    .sort((a, b) => a.dist - b.dist);

  const withinRadius = allSorted.filter((item) => item.dist <= maxKm);
  const usedFallback = withinRadius.length === 0;
  return {
    withinRadius,
    displayList: usedFallback ? allSorted.slice(0, 4) : withinRadius,
    usedFallback,
  };
}

export interface NearbyVolunteer {
  volunteer: Volunteer;
  dist: number;
}

/** Returns nearby volunteers sorted by distance, plus closest-3 fallback when none sit within maxKm. */
export function getNearbyVolunteers(
  student: Pick<Student, "lat" | "lng">,
  volunteers: Volunteer[],
  maxKm = 5.0
): { withinRadius: NearbyVolunteer[]; displayList: NearbyVolunteer[]; usedFallback: boolean } {
  const allSorted = volunteers
    .map((volunteer) => ({
      volunteer,
      dist: getDistanceKm(student.lat, student.lng, volunteer.lat, volunteer.lng),
    }))
    .sort((a, b) => a.dist - b.dist);

  const withinRadius = allSorted.filter((item) => item.dist <= maxKm);
  const usedFallback = withinRadius.length === 0;
  return {
    withinRadius,
    displayList: usedFallback ? allSorted.slice(0, 3) : withinRadius,
    usedFallback,
  };
}

/** Filters district students by category pill and name/marks search query. */
export function filterStudents(
  students: Student[],
  categoryFilter: string,
  searchQuery: string
): Student[] {
  const categoryPredicates: Record<string, (s: Student) => boolean> = {
    eng: (s) => s.opted === "Eng",
    arts: (s) => s.opted === "Arts",
    male: (s) => s.gender === "Male",
    female: (s) => s.gender === "Female",
    both: (s) => s.parents === "Both",
    single: (s) => s.parents === "Single",
    orphan: (s) => s.parents === "Orphan",
    above_1lakh: (s) => s.familyIncome > 100000,
    below_1lakh: (s) => s.familyIncome <= 100000,
    own_house: (s) => s.ownHouse === "Yes",
  };

  const predicate = categoryPredicates[categoryFilter];
  let list = predicate ? students.filter(predicate) : students;

  const q = searchQuery.toLowerCase().trim();
  if (q) {
    list = list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.marks.toString().includes(q)
    );
  }
  return list;
}

// Haversine distance calculator in kilometers
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

const colleges = [
  "PSG College of Technology", "CIT Coimbatore", "Anna University (CEG)",
  "Government College of Tech", "Thiagarajar College of Engg", "Loyola College Chennai",
  "Madras Christian College", "St. Joseph's College Trichy", "National College",
  "Alagappa Govt College", "Kongu Engineering College", "Bannari Amman Institute",
  "Kumaraguru College of Tech", "SASTRA Deemed University", "Bishop Heber College"
];

const studentFirstNames = [
  "Karthik", "Ananya", "Vignesh", "Divya", "Suresh", "Meena", "Praveen", "Kavitha",
  "Saravanan", "Priyanka", "Manoj", "Keerthana", "Aravind", "Nandhini", "Dinesh", "Subha",
  "Hariharan", "Lavanya", "Balaji", "Pavithra", "Gokul", "Deepika", "Kishore", "Revathi",
  "Siddharth", "Sowmya", "Madhan", "Gayathri", "Ganesh", "Abinaya", "Mukesh", "Ranjitha"
];

function generateMockData(lat: number, lng: number, seed: number) {
  const students: Student[] = [];
  const studentCount = 35;
  const parentOptions: ("Both" | "Single" | "Orphan")[] = ["Both", "Single", "Both", "Orphan", "Both", "Single"];
  const optOptions: ("Eng" | "Arts")[] = ["Eng", "Arts", "Eng", "Eng", "Arts"];

  for (let i = 0; i < studentCount; i++) {
    const isMale = (i + seed) % 2 === 0;
    const rawIncome = 35000 + (((i * 29 + seed * 43) % 16) * 10000);
    const familyIncome = rawIncome > 140000 ? 120000 + ((i * 13) % 65000) : rawIncome;
    const ownHouse: "Yes" | "No" = (i + seed) % 4 === 0 ? "Yes" : "No";

    const angle = ((i * 137.5) * Math.PI) / 180;
    const dist = 0.02 + ((i * 7 + seed) % 18) * 0.0035;
    const sLat = lat + dist * Math.cos(angle);
    const sLng = lng + dist * Math.sin(angle);

    students.push({
      id: `S-${seed.toString().padStart(2, "0")}-${(i + 1).toString().padStart(2, "0")}`,
      name: `${studentFirstNames[(i + seed) % studentFirstNames.length]} ${String.fromCharCode(65 + ((i * 3 + seed) % 26))}.`,
      gender: isMale ? "Male" : "Female",
      marks: 380 + ((i * 17 + seed * 23) % 215),
      opted: optOptions[(i + seed) % optOptions.length],
      parents: parentOptions[(i + seed) % parentOptions.length],
      familyIncome,
      ownHouse,
      lat: sLat,
      lng: sLng,
    });
  }

  const volunteers: Volunteer[] = [];
  const volunteerCount = 12;
  for (let j = 0; j < volunteerCount; j++) {
    const pvCount = 8 + ((j * 11 + seed * 7) % 32);
    const pvAssigned = pvCount + 4 + ((j * 5 + seed) % 16);
    const vAngle = ((j * 30 + 15) * Math.PI) / 180;
    const vDist = 0.02 + ((j * 9 + seed) % 14) * 0.004;
    const vLat = lat + vDist * Math.cos(vAngle);
    const vLng = lng + vDist * Math.sin(vAngle);
    const nearCount = students.filter((s) => getDistanceKm(vLat, vLng, s.lat, s.lng) <= 5.0).length;

    volunteers.push({
      id: `V-${seed.toString().padStart(2, "0")}-${(j + 1).toString().padStart(2, "0")}`,
      name: `Vol. ${studentFirstNames[(j * 3 + seed + 7) % studentFirstNames.length]} ${String.fromCharCode(65 + ((j + seed) % 26))}.`,
      college: colleges[(j + seed) % colleges.length],
      pvCount,
      pvAssigned,
      nearToApplicants: nearCount,
      lat: vLat,
      lng: vLng,
    });
  }

  return { students, volunteers };
}

// 38 Districts of Tamil Nadu
const rawDistricts: { name: string; lat: number; lng: number; total: number; male: number }[] = [
  { name: "Ariyalur", lat: 11.1401, lng: 79.0786, total: 840, male: 420 },
  { name: "Chengalpattu", lat: 12.6841, lng: 79.9836, total: 1950, male: 970 },
  { name: "Chennai", lat: 13.0550, lng: 80.2250, total: 3450, male: 1720 },
  { name: "Coimbatore", lat: 11.0168, lng: 76.9558, total: 2890, male: 1410 },
  { name: "Cuddalore", lat: 11.7480, lng: 79.7714, total: 1420, male: 730 },
  { name: "Dharmapuri", lat: 12.1211, lng: 78.1582, total: 1180, male: 600 },
  { name: "Dindigul", lat: 10.3673, lng: 77.9803, total: 1540, male: 780 },
  { name: "Erode", lat: 11.3410, lng: 77.7172, total: 1670, male: 830 },
  { name: "Kallakurichi", lat: 11.7384, lng: 78.9639, total: 980, male: 490 },
  { name: "Kanchipuram", lat: 12.8342, lng: 79.7036, total: 1560, male: 780 },
  { name: "Kanyakumari", lat: 8.0883, lng: 77.5385, total: 1340, male: 650 },
  { name: "Karur", lat: 10.9601, lng: 78.0766, total: 890, male: 450 },
  { name: "Krishnagiri", lat: 12.5186, lng: 78.2137, total: 1320, male: 680 },
  { name: "Madurai", lat: 9.9252, lng: 78.1198, total: 2750, male: 1390 },
  { name: "Mayiladuthurai", lat: 11.1018, lng: 79.6522, total: 820, male: 410 },
  { name: "Nagapattinam", lat: 10.7656, lng: 79.8424, total: 940, male: 480 },
  { name: "Namakkal", lat: 11.2189, lng: 78.1674, total: 1150, male: 590 },
  { name: "Nilgiris", lat: 11.4102, lng: 76.6950, total: 620, male: 300 },
  { name: "Perambalur", lat: 11.2342, lng: 78.8817, total: 710, male: 360 },
  { name: "Pudukkottai", lat: 10.3797, lng: 78.8208, total: 1260, male: 640 },
  { name: "Ramanathapuram", lat: 9.3639, lng: 78.8395, total: 1080, male: 550 },
  { name: "Ranipet", lat: 12.9298, lng: 79.3330, total: 1140, male: 570 },
  { name: "Salem", lat: 11.6643, lng: 78.1460, total: 2310, male: 1180 },
  { name: "Sivaganga", lat: 9.8433, lng: 78.4809, total: 990, male: 500 },
  { name: "Tenkasi", lat: 8.9594, lng: 77.3152, total: 1050, male: 520 },
  { name: "Thanjavur", lat: 10.7870, lng: 79.1378, total: 1840, male: 910 },
  { name: "Theni", lat: 10.0104, lng: 77.4768, total: 960, male: 490 },
  { name: "Thoothukudi", lat: 8.7642, lng: 78.1348, total: 1470, male: 740 },
  { name: "Tiruchirappalli", lat: 10.7905, lng: 78.7047, total: 2420, male: 1220 },
  { name: "Tirunelveli", lat: 8.7139, lng: 77.7567, total: 1890, male: 950 },
  { name: "Tirupathur", lat: 12.4926, lng: 78.5678, total: 920, male: 460 },
  { name: "Tiruppur", lat: 11.1085, lng: 77.3411, total: 1980, male: 1020 },
  { name: "Tiruvallur", lat: 13.1432, lng: 79.9074, total: 1830, male: 920 },
  { name: "Tiruvannamalai", lat: 12.2253, lng: 79.0747, total: 1610, male: 810 },
  { name: "Tiruvarur", lat: 10.7725, lng: 79.6365, total: 890, male: 450 },
  { name: "Vellore", lat: 12.9165, lng: 79.1325, total: 1780, male: 890 },
  { name: "Viluppuram", lat: 11.9401, lng: 79.4861, total: 1530, male: 770 },
  { name: "Virudhunagar", lat: 9.5680, lng: 77.9624, total: 1390, male: 700 },
];

export const DISTRICTS: District[] = rawDistricts.map((d, idx) => {
  const { students, volunteers } = generateMockData(d.lat, d.lng, idx + 1);
  return {
    name: d.name,
    totalApplicants: d.total,
    male: d.male,
    female: d.total - d.male,
    lat: d.lat,
    lng: d.lng,
    students,
    volunteers,
  };
});
