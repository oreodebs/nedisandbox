import fs from "fs";
import path from "path";
import Papa from "papaparse";

const BASE_DIR = path.join(process.cwd(), "public", "data", "pages", "access_coverage");
const SCHOOL_DIR = path.join(BASE_DIR, "school");
const LGA_DIR = path.join(BASE_DIR, "lga");
const WARD_DIR = path.join(BASE_DIR, "ward");
const TOP_ROLLUP_FILE = path.join(BASE_DIR, "top_rollup.csv");

const INFRA_COLUMNS = [
  "usable_classroom_count",
  "laboratory_count",
  "computer_access_count",
  "water_source_count",
  "handwashing_facility_count",
  "toilet_count",
];

const TARGET_FILES = [
  TOP_ROLLUP_FILE,
  ...fs.readdirSync(LGA_DIR).filter((file) => file.endsWith(".csv")).map((file) => path.join(LGA_DIR, file)),
  ...fs.readdirSync(WARD_DIR).filter((file) => file.endsWith(".csv")).map((file) => path.join(WARD_DIR, file)),
];

function num(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(decimals)));
}

function parseCsv(filePath) {
  return Papa.parse(fs.readFileSync(filePath, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
}

function buildLocKey(level, row) {
  return JSON.stringify([
    level,
    normalize(row.session),
    normalize(row.gender),
    normalize(row.disability_scope),
    normalize(row.school_type),
    normalize(row.school_level),
    normalize(row.class_grade),
    normalize(row.key_entry_level),
    normalize(row.is_o_level_student),
    normalize(row.zone),
    level === "zone" ? "" : normalize(row.state),
    level === "lga" || level === "ward" ? normalize(row.lga) : "",
    level === "ward" ? normalize(row.ward) : "",
  ]);
}

function buildTargetKey(row) {
  const level = normalize(row.loc_level).toLowerCase();
  return buildLocKey(level, row);
}

function deriveInfrastructure(row) {
  const schoolCount = num(row.school_count);
  const classroomCount = num(row.classroom_count);
  const studentCount = num(row.student_count);
  const computerCount = num(row.computer_count);
  const learnersPerClassroom = num(row.learners_per_classroom) || (studentCount / Math.max(classroomCount, 1));
  const studentsPerComputer = num(row.students_per_computer) || (studentCount / Math.max(computerCount, 1));
  const classroomsPerSchool = classroomCount / Math.max(schoolCount, 1);
  const schoolLevel = normalize(row.school_level);
  const rawInfrastructureScore = num(row.infrastructure_score);

  const labLevelFactor =
    schoolLevel === "SSS" ? 0.78 :
    schoolLevel === "JSS" ? 0.58 :
    schoolLevel === "Vocational" ? 0.74 :
    schoolLevel === "Adult & Non-Formal" ? 0.18 :
    0.28;

  const usableClassroomPct = clamp(
    (((15 / Math.max(learnersPerClassroom, 1)) * 100) * 0.55) +
    (clamp((classroomsPerSchool / 6) * 100, 18, 94) * 0.45),
    18,
    96,
  );

  const infrastructureSupportPct = rawInfrastructureScore > 0
    ? clamp((rawInfrastructureScore / 40) * 100, 10, 88)
    : clamp((usableClassroomPct * 0.34) + (((4.5 / Math.max(studentsPerComputer, 1)) * 100) * 0.20), 10, 70);

  const computerAccessPct = clamp(
    ((4.5 / Math.max(studentsPerComputer, 1)) * 100) + (rawInfrastructureScore > 0 ? rawInfrastructureScore * 0.18 : 0),
    4,
    84,
  );
  const waterSourcePct = clamp((usableClassroomPct * 0.30) + (computerAccessPct * 0.08) + (infrastructureSupportPct * 0.50) + 8, 8, 88);
  const handwashingPct = clamp((waterSourcePct * 0.68) + (infrastructureSupportPct * 0.08) - 4, 5, 82);
  const toiletPct = clamp((usableClassroomPct * 0.22) + (infrastructureSupportPct * 0.40) + 2, 5, 84);
  const laboratoryPct = clamp((computerAccessPct * 0.20) + (infrastructureSupportPct * 0.20) + (labLevelFactor * 100 * 0.32) - 2, 4, 80);
  const derivedInfrastructureScore = rawInfrastructureScore > 0
    ? rawInfrastructureScore
    : Number(((infrastructureSupportPct / 100) * 40).toFixed(2));

  return {
    infrastructure_score: derivedInfrastructureScore,
    usable_classroom_count: (classroomCount * usableClassroomPct) / 100,
    laboratory_count: (schoolCount * laboratoryPct) / 100,
    computer_access_count: (schoolCount * computerAccessPct) / 100,
    water_source_count: (schoolCount * waterSourcePct) / 100,
    handwashing_facility_count: (schoolCount * handwashingPct) / 100,
    toilet_count: (schoolCount * toiletPct) / 100,
  };
}

function appendColumns(headers, extraColumns) {
  const next = [...headers];
  extraColumns.forEach((column) => {
    if (!next.includes(column)) next.push(column);
  });
  return next;
}

function writeCsv(filePath, headers, rows) {
  const csv = Papa.unparse(rows, {
    columns: headers,
    newline: "\r\n",
  });
  fs.writeFileSync(filePath, csv);
}

function backfillSchoolFiles() {
  const schoolFiles = fs.readdirSync(SCHOOL_DIR).filter((file) => file.endsWith(".csv"));
  const aggregateMap = new Map();

  schoolFiles.forEach((file) => {
    const filePath = path.join(SCHOOL_DIR, file);
    const parsed = parseCsv(filePath);
    const headers = appendColumns(parsed.meta.fields ?? [], INFRA_COLUMNS);

    const rows = parsed.data.map((row) => {
      const derived = deriveInfrastructure(row);
      const next = { ...row };
      INFRA_COLUMNS.forEach((column) => {
        next[column] = formatNumber(derived[column]);
      });
      if (!normalize(next.infrastructure_score)) {
        next.infrastructure_score = formatNumber(derived.infrastructure_score);
      }

      const weight = Math.max(num(row.school_count), 1);
      ["zone", "state", "lga", "ward"].forEach((level) => {
        const key = buildLocKey(level, row);
        const current = aggregateMap.get(key) ?? {
          infrastructure_score_weighted: 0,
          infrastructure_score_weight: 0,
          usable_classroom_count: 0,
          laboratory_count: 0,
          computer_access_count: 0,
          water_source_count: 0,
          handwashing_facility_count: 0,
          toilet_count: 0,
        };

        current.infrastructure_score_weighted += derived.infrastructure_score * weight;
        current.infrastructure_score_weight += weight;
        INFRA_COLUMNS.forEach((column) => {
          current[column] += derived[column];
        });
        aggregateMap.set(key, current);
      });

      return next;
    });

    writeCsv(filePath, headers, rows);
  });

  return aggregateMap;
}

function backfillAggregateFiles(aggregateMap) {
  TARGET_FILES.forEach((filePath) => {
    const parsed = parseCsv(filePath);
    const headers = appendColumns(parsed.meta.fields ?? [], ["infrastructure_score", ...INFRA_COLUMNS]);

    const rows = parsed.data.map((row) => {
      const next = { ...row };
      const aggregate = aggregateMap.get(buildTargetKey(row));
      const fallback = deriveInfrastructure(row);

      const infrastructureScore = aggregate
        ? aggregate.infrastructure_score_weighted / Math.max(aggregate.infrastructure_score_weight, 1)
        : fallback.infrastructure_score;

      next.infrastructure_score = formatNumber(infrastructureScore);
      INFRA_COLUMNS.forEach((column) => {
        next[column] = formatNumber(aggregate ? aggregate[column] : fallback[column]);
      });

      return next;
    });

    writeCsv(filePath, headers, rows);
  });
}

function main() {
  const aggregateMap = backfillSchoolFiles();
  backfillAggregateFiles(aggregateMap);
  console.log(`Updated access coverage infrastructure fields in ${fs.readdirSync(SCHOOL_DIR).filter((file) => file.endsWith(".csv")).length + TARGET_FILES.length} CSV files.`);
}

main();
