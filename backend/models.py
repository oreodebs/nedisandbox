from __future__ import annotations

import enum
from datetime import date
from typing import Optional
from db import Base

from sqlalchemy import (
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)




# -----------------------------
# Enums
# -----------------------------
class GenderEnum(str, enum.Enum):
    MALE = "Male"
    FEMALE = "Female"
    UNKNOWN = "Unknown"


class StageEnum(str, enum.Enum):
    SS3 = "SS3"
    WAEC = "WAEC"
    JAMB = "JAMB"
    ADMISSION = "ADMISSION"
    MATRIC = "MATRIC"


class SchoolTypeEnum(str, enum.Enum):
    PUBLIC = "Public"
    PRIVATE = "Private"
    FAITH_BASED = "Faith-based"
    COMMUNITY = "Community"


class SchoolLevelEnum(str, enum.Enum):
    SSS_ONLY = "SSS"
    JSS_SSS = "JSS+SSS"


# -----------------------------
# Dimensions
# -----------------------------
class Location(Base):
    """
    Ward-level location dimension.
    Each row represents ONE ward and carries its full hierarchy:
    zone -> state -> lga -> ward
    """
    __tablename__ = "dim_location"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    zone: Mapped[str] = mapped_column(String(50), index=True)
    state: Mapped[str] = mapped_column(String(50), index=True)
    lga: Mapped[str] = mapped_column(String(80), index=True)
    ward: Mapped[str] = mapped_column(String(120), index=True)

    __table_args__ = (
        UniqueConstraint("zone", "state", "lga", "ward", name="uq_location_zone_state_lga_ward"),
        Index("ix_location_state_lga", "state", "lga"),
        Index("ix_location_zone_state", "zone", "state"),
    )


class Learner(Base):
    __tablename__ = "dim_learner"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gender: Mapped[GenderEnum] = mapped_column(Enum(GenderEnum), index=True, default=GenderEnum.UNKNOWN)

    # Optional: home ward (if you want to analyze by home location later)
    home_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    home_location: Mapped[Optional[Location]] = relationship(lazy="joined")


class School(Base):
    """
    Schools are attached to wards (best granularity).
    This allows:
    - schools under LGA (via join on Location.state+Location.lga)
    - schools under ward (direct)
    """
    __tablename__ = "dim_school"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    school_name: Mapped[str] = mapped_column(String(200), index=True)
    school_type: Mapped[SchoolTypeEnum] = mapped_column(Enum(SchoolTypeEnum), index=True)
    school_level: Mapped[SchoolLevelEnum] = mapped_column(Enum(SchoolLevelEnum), index=True)

    ward_location_id: Mapped[int] = mapped_column(
        ForeignKey("dim_location.id", ondelete="RESTRICT"),
        index=True,
    )

    ward_location: Mapped[Location] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_school_ward", "ward_location_id"),
    )


# -----------------------------
# Facts
# -----------------------------
class SS3Completion(Base):
    """
    Defines the cohort year (SS3 year) and the ward/school context at SS3 time.

    This table powers:
    - Direct Transition dashboard (cohort-based)
    - Gap band in All-Years dashboard (activity_year - ss3_year)
    - Gender/location splits (join via learner + location)
    """
    __tablename__ = "fact_ss3_completion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    ss3_year: Mapped[int] = mapped_column(Integer, index=True)  # <= 2025 for your dummy data
    completion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    ward_location_id: Mapped[int] = mapped_column(
        ForeignKey("dim_location.id", ondelete="RESTRICT"),
        index=True,
    )

    school_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_school.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    completed: Mapped[bool] = mapped_column(Boolean, default=True)

    learner: Mapped[Learner] = relationship()
    ward_location: Mapped[Location] = relationship()
    school: Mapped[Optional[School]] = relationship()

    __table_args__ = (
        UniqueConstraint("learner_id", "ss3_year", name="uq_ss3_learner_year"),
        Index("ix_ss3_year_ward", "ss3_year", "ward_location_id"),
        CheckConstraint("ss3_year <= 2025", name="ck_ss3_year_le_2025"),
    )


class WAEC(Base):
    __tablename__ = "fact_waec_attempt"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    exam_year: Mapped[int] = mapped_column(Integer, index=True)
    exam_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # passed can be NULL if result not available
    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, index=True)

    attempt_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Optional: where WAEC was written (ward). If not available, leave NULL.
    ward_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    learner: Mapped[Learner] = relationship()
    ward_location: Mapped[Optional[Location]] = relationship()

    __table_args__ = (
        Index("ix_waec_year_passed", "exam_year", "passed"),
        CheckConstraint("exam_year <= 2025", name="ck_waec_year_le_2025"),
    )


class JAMB(Base):
    __tablename__ = "fact_jamb_attempt"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    exam_year: Mapped[int] = mapped_column(Integer, index=True)
    exam_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    passed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, index=True)

    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    attempt_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    ward_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    learner: Mapped[Learner] = relationship()

    __table_args__ = (
        Index("ix_jamb_year_passed", "exam_year", "passed"),
        CheckConstraint("exam_year <= 2025", name="ck_jamb_year_le_2025"),
    )


class Admission(Base):
    __tablename__ = "fact_admission"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    admission_year: Mapped[int] = mapped_column(Integer, index=True)
    admission_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    admitted: Mapped[bool] = mapped_column(Boolean, default=True)

    # Optional: tertiary institution identity (keep simple for now)
    institution_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    programme: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Optional: tertiary institution location (ward) if you want geo analysis by institution location
    ward_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    learner: Mapped[Learner] = relationship()

    __table_args__ = (
        Index("ix_admission_year_admitted", "admission_year", "admitted"),
        CheckConstraint("admission_year <= 2025", name="ck_admission_year_le_2025"),
    )


class Matriculation(Base):
    __tablename__ = "fact_matriculation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    matric_year: Mapped[int] = mapped_column(Integer, index=True)
    matric_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    matriculated: Mapped[bool] = mapped_column(Boolean, default=True)

    institution_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    programme: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    ward_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dim_location.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    learner: Mapped[Learner] = relationship()

    __table_args__ = (
        Index("ix_matric_year_matriculated", "matric_year", "matriculated"),
        CheckConstraint("matric_year <= 2025", name="ck_matric_year_le_2025"),
    )


# -----------------------------
# Optional: Drop-off reasons (for richer "why" charts)
# -----------------------------
class DropoutReason(Base):
    __tablename__ = "dim_dropout_reason"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(150))


class Dropout(Base):
    __tablename__ = "fact_dropout"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    learner_id: Mapped[int] = mapped_column(
        ForeignKey("dim_learner.id", ondelete="CASCADE"),
        index=True,
    )

    # for Direct Transition breakdowns (cohort view)
    cohort_ss3_year: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)

    # for All-Years breakdowns (activity view)
    activity_year: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)

    stage: Mapped[StageEnum] = mapped_column(Enum(StageEnum), index=True)
    reason_id: Mapped[int] = mapped_column(
        ForeignKey("dim_dropout_reason.id", ondelete="RESTRICT"),
        index=True,
    )

    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    learner: Mapped[Learner] = relationship()
    reason: Mapped[DropoutReason] = relationship()

    __table_args__ = (
        CheckConstraint("(cohort_ss3_year IS NOT NULL) OR (activity_year IS NOT NULL)", name="ck_dropout_has_year"),
        CheckConstraint("cohort_ss3_year IS NULL OR cohort_ss3_year <= 2025", name="ck_dropout_cohort_year_le_2025"),
        CheckConstraint("activity_year IS NULL OR activity_year <= 2025", name="ck_dropout_activity_year_le_2025"),
    )