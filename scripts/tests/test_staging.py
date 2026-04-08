"""Tests for scripts/ridingazua-stage.py GPX parsing + duplicate-safe upserts."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Haversine
# ---------------------------------------------------------------------------

def test_haversine_zero_distance(stage_module) -> None:
    d = stage_module.haversine_km(37.5665, 126.9780, 37.5665, 126.9780)
    assert d == pytest.approx(0.0, abs=1e-9)


def test_haversine_known_seoul_busan(stage_module) -> None:
    # Seoul City Hall to Busan City Hall is roughly 325 km.
    d = stage_module.haversine_km(37.5665, 126.9780, 35.1796, 129.0756)
    assert 320.0 < d < 330.0


def test_haversine_known_one_degree_lat(stage_module) -> None:
    # One degree of latitude ~= 111 km.
    d = stage_module.haversine_km(37.0, 127.0, 38.0, 127.0)
    assert 110.0 < d < 112.0


# ---------------------------------------------------------------------------
# normalize_title
# ---------------------------------------------------------------------------

def test_normalize_title_basic(stage_module) -> None:
    assert stage_module.normalize_title("  Hello   World  ") == "hello world"


def test_normalize_title_none(stage_module) -> None:
    assert stage_module.normalize_title(None) is None


def test_normalize_title_korean(stage_module) -> None:
    assert stage_module.normalize_title("  서울   라이딩  ") == "서울 라이딩"


# ---------------------------------------------------------------------------
# parse_gpx_metrics — valid GPX
# ---------------------------------------------------------------------------

def test_parse_valid_gpx_point_count(stage_module, valid_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)
    assert parsed.point_count == 3


def test_parse_valid_gpx_distance_within_1pct(stage_module, valid_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)
    # Expected distance from direct haversine calculation over the 3 points.
    expected_km = (
        stage_module.haversine_km(37.5665, 126.9780, 37.5765, 126.9780)
        + stage_module.haversine_km(37.5765, 126.9780, 37.5865, 126.9880)
    )
    tolerance = expected_km * 0.01  # 1 %
    assert abs(parsed.distance_km - expected_km) <= tolerance


def test_parse_valid_gpx_elevation_gain_positive(stage_module, valid_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)
    # Deltas are +5m and +7m, both above the 3m noise threshold → 12m total.
    assert parsed.elevation_gain_m > 0
    assert parsed.elevation_gain_m == pytest.approx(12.0, abs=0.5)


def test_parse_valid_gpx_start_and_end(stage_module, valid_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)
    assert parsed.start_lat == pytest.approx(37.5665)
    assert parsed.start_lng == pytest.approx(126.9780)
    assert parsed.end_lat == pytest.approx(37.5865)
    assert parsed.end_lng == pytest.approx(126.9880)
    assert parsed.start_ele_m == pytest.approx(50.0)
    assert parsed.end_ele_m == pytest.approx(62.0)


def test_parse_valid_gpx_bbox(stage_module, valid_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)
    assert parsed.bbox_min_lat == pytest.approx(37.5665)
    assert parsed.bbox_max_lat == pytest.approx(37.5865)
    assert parsed.bbox_min_lng == pytest.approx(126.9780)
    assert parsed.bbox_max_lng == pytest.approx(126.9880)


def test_parse_valid_gpx_route_hash_is_stable(stage_module, valid_gpx_path: Path) -> None:
    first = stage_module.parse_gpx_metrics(valid_gpx_path)
    second = stage_module.parse_gpx_metrics(valid_gpx_path)
    assert first.route_hash == second.route_hash
    assert len(first.route_hash) == 40  # SHA1 hex digest


# ---------------------------------------------------------------------------
# parse_gpx_metrics — minimal, invalid, empty
# ---------------------------------------------------------------------------

def test_parse_minimal_gpx(stage_module, minimal_gpx_path: Path) -> None:
    parsed = stage_module.parse_gpx_metrics(minimal_gpx_path)
    assert parsed.point_count == 1
    assert parsed.distance_km == pytest.approx(0.0)
    assert parsed.elevation_gain_m == pytest.approx(0.0)
    assert parsed.start_ele_m is None


def test_parse_invalid_gpx_raises(stage_module, invalid_gpx_path: Path) -> None:
    # Malformed XML must surface as an exception; the production
    # `main()` loop catches this and records a parse failure.
    with pytest.raises(Exception):
        stage_module.parse_gpx_metrics(invalid_gpx_path)


def test_parse_empty_gpx_raises(stage_module, empty_gpx_path: Path) -> None:
    with pytest.raises(Exception):
        stage_module.parse_gpx_metrics(empty_gpx_path)


def test_parse_missing_file_raises(stage_module, tmp_path: Path) -> None:
    missing = tmp_path / "does-not-exist.gpx"
    with pytest.raises(Exception):
        stage_module.parse_gpx_metrics(missing)


# ---------------------------------------------------------------------------
# Duplicate-safe staging — insert same GPX twice, expect 1 row.
# ---------------------------------------------------------------------------

def _insert_sample_batch(conn: sqlite3.Connection) -> int:
    cursor = conn.execute(
        """
        INSERT INTO import_batch (output_dir, manifest_path, summary_path,
          started_at, finished_at, total_courses, processed, downloaded, failed, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("/tmp/test", "/tmp/test/manifest.jsonl", None, None, None, 1, 1, 1, 0, "{}"),
    )
    return int(cursor.lastrowid)


def test_duplicate_staging_single_row(
    stage_module,
    temp_db: sqlite3.Connection,
    valid_gpx_path: Path,
) -> None:
    batch_id = _insert_sample_batch(temp_db)
    entry = {
        "courseId": 12345,
        "title": "Duplicate Test Route",
        "status": "downloaded",
        "bytes": 1024,
        "timestamp": "2026-04-08T00:00:00Z",
        "path": str(valid_gpx_path),
    }

    parsed = stage_module.parse_gpx_metrics(valid_gpx_path)

    # First ingest
    stage_module.upsert_raw_course(temp_db, batch_id, entry, valid_gpx_path)
    stage_module.upsert_geometry(temp_db, 12345, parsed, None)
    # Second ingest of the very same course_id / GPX
    stage_module.upsert_raw_course(temp_db, batch_id, entry, valid_gpx_path)
    stage_module.upsert_geometry(temp_db, 12345, parsed, None)

    raw_count = temp_db.execute("SELECT COUNT(*) FROM raw_course WHERE course_id = 12345").fetchone()[0]
    geom_count = temp_db.execute("SELECT COUNT(*) FROM course_geometry WHERE course_id = 12345").fetchone()[0]
    assert raw_count == 1
    assert geom_count == 1

    row = temp_db.execute(
        "SELECT route_hash FROM course_geometry WHERE course_id = 12345"
    ).fetchone()
    assert row["route_hash"] == parsed.route_hash


def test_upsert_geometry_failure_path(stage_module, temp_db: sqlite3.Connection, valid_gpx_path: Path) -> None:
    """The failure branch records parse_status='failed' with the error message."""
    batch_id = _insert_sample_batch(temp_db)
    entry = {
        "courseId": 999,
        "title": "Broken",
        "status": "downloaded",
        "path": str(valid_gpx_path),
    }
    stage_module.upsert_raw_course(temp_db, batch_id, entry, valid_gpx_path)
    stage_module.upsert_geometry(temp_db, 999, None, "simulated parse error")
    row = temp_db.execute(
        "SELECT parse_status, parse_error FROM course_geometry WHERE course_id = 999"
    ).fetchone()
    assert row["parse_status"] == "failed"
    assert row["parse_error"] == "simulated parse error"


def test_ensure_schema_idempotent(stage_module, tmp_path: Path) -> None:
    """Running ensure_schema twice on the same DB must not raise."""
    schema_path = (
        Path(__file__).resolve().parent.parent / "sql" / "ridingazua_staging_schema.sql"
    )

    db = tmp_path / "schema.sqlite3"
    conn = sqlite3.connect(str(db))
    stage_module.ensure_schema(conn, schema_path)
    stage_module.ensure_schema(conn, schema_path)
    # sanity: the expected tables exist
    names = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    assert "raw_course" in names
    assert "course_geometry" in names
    conn.close()
