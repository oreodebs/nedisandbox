export type GenderFilter = "" | "Male" | "Female";
export type GapBandFilter = "" | "1-year" | "2-year" | "3-5-year" | "5+-year";
export type ExamBodyFilter = "" | "WAEC" | "NECO" | "NABTEB";
export type SchoolTypeFilter = "" | "Public" | "Private";
export type SchoolLevelFilter = "" | "Pre-Primary/Primary" | "JSS" | "SSS";
export type QualificationStatusFilter = "" | "Qualified" | "Unqualified";

export type MinisterFilters = {
  session: string;
  zone: string;
  state: string;
  lga: string;
  ward: string;
  school: string;
  gender: GenderFilter;
  gap_band: GapBandFilter;
  exam_body: ExamBodyFilter;
  school_type: SchoolTypeFilter;
  school_level: SchoolLevelFilter;
  class_grade: string;
  qualification_status: QualificationStatusFilter;
  institution_type: string;
  tertiary_institution: string;
  programme_cluster: string;
  discipline_group: string;
  programme: string;
};

export type DimSession = {
  session_id: string;
  start_year: number;
  end_year: number;
  prev_session_id: string;
};

export type DimState = {
  state_key: string;
  state: string;
  zone: string;
};

export type DimLga = {
  lga_key: string;
  lga: string;
  state_key: string;
  state: string;
  zone: string;
};

export type DimWard = {
  ward_key: string;
  ward: string;
  lga: string;
  state: string;
  zone: string;
};

export type DimSchool = {
  school_key: string;
  school: string;
  institution_type: string;
  ward: string;
  lga: string;
  state: string;
  zone: string;
};
