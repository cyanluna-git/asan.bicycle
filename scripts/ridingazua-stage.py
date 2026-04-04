#!/usr/bin/env python3
"""
Create and populate a local SQLite staging database for Ridingazua GPX exports.

Phase 1 scope:
- create the staging schema used by later classification phases
- ingest manifest.jsonl + summary.json metadata
- parse downloaded GPX files into core geometry metrics

Usage:
  python3 scripts/ridingazua-stage.py
  python3 scripts/ridingazua-stage.py --source-dir courses/ridingazua-public-gpx-20260308
  python3 scripts/ridingazua-stage.py --limit 100
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
import xml.etree.ElementTree as ET


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
SCHEMA_PATH = Path(__file__).with_name("sql").joinpath("ridingazua_staging_schema.sql")
GPX_NS_11 = "http://www.topografix.com/GPX/1/1"
GPX_NS_10 = "http://www.topografix.com/GPX/1/0"


@dataclass
class ParsedGeometry:
    point_count: int
    waypoint_count: int
    start_lat: float | None
    start_lng: float | None
    end_lat: float | None
    end_lng: float | None
    start_ele_m: float | None
    end_ele_m: float | None
    bbox_min_lat: float | None
    bbox_min_lng: float | None
    bbox_max_lat: float | None
    bbox_max_lng: float | None
    distance_km: float
    elevation_gain_m: float
    route_hash: str


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def normalize_title(value: str | None) -> str | None:
    if value is None:
      return None
    return " ".join(value.casefold().split())


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0088
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(a))


def detect_namespace(root: ET.Element) -> str | None:
    tag = root.tag or ""
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return None


def collect_points(root: ET.Element, namespace: str | None) -> tuple[list[tuple[float, float, float | None]], int]:
    if namespace:
        trkpt_path = f".//{{{namespace}}}trkpt"
        rtept_path = f".//{{{namespace}}}rtept"
        wpt_path = f".//{{{namespace}}}wpt"
        ele_tag = f"{{{namespace}}}ele"
    else:
        trkpt_path = ".//trkpt"
        rtept_path = ".//rtept"
        wpt_path = ".//wpt"
        ele_tag = "ele"

    waypoint_count = len(root.findall(wpt_path))
    ordered_points = root.findall(trkpt_path)
    if not ordered_points:
        ordered_points = root.findall(rtept_path)
    if not ordered_points:
        ordered_points = root.findall(wpt_path)

    points: list[tuple[float, float, float | None]] = []
    for element in ordered_points:
        lat_raw = element.get("lat")
        lng_raw = element.get("lon")
        if lat_raw is None or lng_raw is None:
            continue
        ele_element = element.find(ele_tag)
        ele_value = float(ele_element.text) if ele_element is not None and ele_element.text else None
        points.append((float(lat_raw), float(lng_raw), ele_value))
    return points, waypoint_count


def parse_gpx_metrics(gpx_path: Path) -> ParsedGeometry:
    root = ET.parse(gpx_path).getroot()
    namespace = detect_namespace(root)
    points, waypoint_count = collect_points(root, namespace)

    if not points:
        raise ValueError("No track, route, or waypoint coordinates found in GPX")

    start_lat, start_lng, start_ele = points[0]
    end_lat, end_lng, end_ele = points[-1]
    min_lat = max_lat = start_lat
    min_lng = max_lng = start_lng
    total_distance_km = 0.0
    total_elevation_gain = 0.0
    route_hasher = hashlib.sha1()
    previous = None

    for lat, lng, ele in points:
        min_lat = min(min_lat, lat)
        max_lat = max(max_lat, lat)
        min_lng = min(min_lng, lng)
        max_lng = max(max_lng, lng)
        route_hasher.update(f"{lat:.6f},{lng:.6f},{'' if ele is None else round(ele, 1)}|".encode("utf-8"))

        if previous is not None:
            prev_lat, prev_lng, prev_ele = previous
            total_distance_km += haversine_km(prev_lat, prev_lng, lat, lng)
            if prev_ele is not None and ele is not None and ele > prev_ele:
                total_elevation_gain += ele - prev_ele
        previous = (lat, lng, ele)

    return ParsedGeometry(
        point_count=len(points),
        waypoint_count=waypoint_count,
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        start_ele_m=start_ele,
        end_ele_m=end_ele,
        bbox_min_lat=min_lat,
        bbox_min_lng=min_lng,
        bbox_max_lat=max_lat,
        bbox_max_lng=max_lng,
        distance_km=round(total_distance_km, 3),
        elevation_gain_m=round(total_elevation_gain, 1),
        route_hash=route_hasher.hexdigest(),
    )


def load_summary(summary_path: Path) -> dict:
    if not summary_path.exists():
        return {}
    return json.loads(summary_path.read_text(encoding="utf-8"))


def iter_manifest_entries(manifest_path: Path):
    with manifest_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def ensure_schema(connection: sqlite3.Connection, schema_path: Path) -> None:
    connection.executescript(schema_path.read_text(encoding="utf-8"))


def insert_import_batch(connection: sqlite3.Connection, source_dir: Path, manifest_path: Path, summary_path: Path, summary: dict) -> int:
    cursor = connection.execute(
        """
        INSERT INTO import_batch (
          output_dir, manifest_path, summary_path, started_at, finished_at,
          total_courses, processed, downloaded, failed, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(source_dir.resolve()),
            str(manifest_path.resolve()),
            str(summary_path.resolve()) if summary_path.exists() else None,
            summary.get("startedAt"),
            summary.get("finishedAt"),
            summary.get("totalCourses"),
            summary.get("processed"),
            summary.get("downloaded"),
            summary.get("failed"),
            json.dumps({"outputDir": summary.get("outputDir")}, ensure_ascii=False),
        ),
    )
    return int(cursor.lastrowid)


def upsert_raw_course(connection: sqlite3.Connection, batch_id: int, entry: dict, gpx_path: Path) -> None:
    course_id = int(entry["courseId"])
    title = entry.get("title")
    downloaded_at = entry.get("timestamp")
    ts = now_iso()
    connection.execute(
        """
        INSERT INTO raw_course (
          course_id, source_url, slug, title, title_normalized, visibility,
          download_status, gpx_path, file_size_bytes, downloaded_at,
          import_batch_id, source_manifest_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(course_id) DO UPDATE SET
          source_url = excluded.source_url,
          slug = excluded.slug,
          title = excluded.title,
          title_normalized = excluded.title_normalized,
          visibility = excluded.visibility,
          download_status = excluded.download_status,
          gpx_path = excluded.gpx_path,
          file_size_bytes = excluded.file_size_bytes,
          downloaded_at = excluded.downloaded_at,
          import_batch_id = excluded.import_batch_id,
          source_manifest_json = excluded.source_manifest_json,
          updated_at = excluded.updated_at
        """,
        (
            course_id,
            f"https://ridingazua.cc/c/{course_id}",
            None,
            title,
            normalize_title(title),
            "public",
            entry.get("status", "unknown"),
            str(gpx_path.resolve()),
            entry.get("bytes"),
            downloaded_at,
            batch_id,
            json.dumps(entry, ensure_ascii=False),
            ts,
            ts,
        ),
    )


def upsert_geometry(connection: sqlite3.Connection, course_id: int, parsed: ParsedGeometry | None, error: str | None) -> None:
    parsed_at = now_iso()
    if parsed is None:
        connection.execute(
            """
            INSERT INTO course_geometry (course_id, parse_status, parse_error, parsed_at)
            VALUES (?, 'failed', ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET
              parse_status = excluded.parse_status,
              parse_error = excluded.parse_error,
              parsed_at = excluded.parsed_at
            """,
            (course_id, error, parsed_at),
        )
        return

    connection.execute(
        """
        INSERT INTO course_geometry (
          course_id, parse_status, parse_error, point_count, waypoint_count,
          start_lat, start_lng, end_lat, end_lng, start_ele_m, end_ele_m,
          bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng,
          distance_km, elevation_gain_m, route_hash, parsed_at
        )
        VALUES (?, 'parsed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(course_id) DO UPDATE SET
          parse_status = excluded.parse_status,
          parse_error = excluded.parse_error,
          point_count = excluded.point_count,
          waypoint_count = excluded.waypoint_count,
          start_lat = excluded.start_lat,
          start_lng = excluded.start_lng,
          end_lat = excluded.end_lat,
          end_lng = excluded.end_lng,
          start_ele_m = excluded.start_ele_m,
          end_ele_m = excluded.end_ele_m,
          bbox_min_lat = excluded.bbox_min_lat,
          bbox_min_lng = excluded.bbox_min_lng,
          bbox_max_lat = excluded.bbox_max_lat,
          bbox_max_lng = excluded.bbox_max_lng,
          distance_km = excluded.distance_km,
          elevation_gain_m = excluded.elevation_gain_m,
          route_hash = excluded.route_hash,
          parsed_at = excluded.parsed_at
        """,
        (
            course_id,
            parsed.point_count,
            parsed.waypoint_count,
            parsed.start_lat,
            parsed.start_lng,
            parsed.end_lat,
            parsed.end_lng,
            parsed.start_ele_m,
            parsed.end_ele_m,
            parsed.bbox_min_lat,
            parsed.bbox_min_lng,
            parsed.bbox_max_lat,
            parsed.bbox_max_lng,
            parsed.distance_km,
            parsed.elevation_gain_m,
            parsed.route_hash,
            parsed_at,
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate local SQLite staging DB from Ridingazua GPX exports")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR, help="Directory containing summary.json, manifest.jsonl, and gpx/")
    parser.add_argument("--db-path", type=Path, default=None, help="SQLite output path (default: <source-dir>/ridingazua-staging.sqlite3)")
    parser.add_argument("--manifest-path", type=Path, default=None, help="Override manifest.jsonl path")
    parser.add_argument("--summary-path", type=Path, default=None, help="Override summary.json path")
    parser.add_argument("--limit", type=int, default=None, help="Only import the first N downloaded GPX entries")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    manifest_path = (args.manifest_path or source_dir / "manifest.jsonl").resolve()
    summary_path = (args.summary_path or source_dir / "summary.json").resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    gpx_dir = source_dir / "gpx"

    if not source_dir.exists():
        raise SystemExit(f"Source directory not found: {source_dir}")
    if not manifest_path.exists():
        raise SystemExit(f"Manifest not found: {manifest_path}")
    if not gpx_dir.exists():
        raise SystemExit(f"GPX directory not found: {gpx_dir}")
    if not SCHEMA_PATH.exists():
        raise SystemExit(f"Schema file not found: {SCHEMA_PATH}")

    summary = load_summary(summary_path)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    ensure_schema(connection, SCHEMA_PATH)
    batch_id = insert_import_batch(connection, source_dir, manifest_path, summary_path, summary)

    imported = 0
    skipped = 0
    parse_failed = 0
    processed = 0

    entries = iter_manifest_entries(manifest_path)
    if args.limit is not None:
        from itertools import islice
        entries = islice(entries, args.limit)

    with connection:
        for entry in entries:
            processed += 1
            if entry.get("status") != "downloaded":
                skipped += 1
                continue

            relative_path = entry.get("path")
            if not relative_path:
                skipped += 1
                continue

            gpx_path = source_dir / relative_path
            if not gpx_path.exists():
                skipped += 1
                continue

            course_id = int(entry["courseId"])
            upsert_raw_course(connection, batch_id, entry, gpx_path)

            try:
                geometry = parse_gpx_metrics(gpx_path)
                upsert_geometry(connection, course_id, geometry, None)
                imported += 1
            except Exception as exc:  # noqa: BLE001
                parse_failed += 1
                upsert_geometry(connection, course_id, None, str(exc))

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "importBatchId": batch_id,
                "processedManifestEntries": processed,
                "importedCourses": imported,
                "skippedEntries": skipped,
                "parseFailed": parse_failed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
