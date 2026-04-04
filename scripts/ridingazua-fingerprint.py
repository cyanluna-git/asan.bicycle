#!/usr/bin/env python3
"""
Build route fingerprints and coarse candidate buckets for Ridingazua staging data.

Phase 3 scope:
- parse GPX paths for sampled route points
- populate route_fingerprint
- populate route_candidate_bucket for coarse similarity candidate reduction
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
import xml.etree.ElementTree as ET


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
SCHEMA_PATH = Path(__file__).with_name("sql").joinpath("ridingazua_staging_schema.sql")


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


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


def collect_points(root: ET.Element, namespace: str | None) -> list[tuple[float, float, float | None]]:
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
    return points


def load_points(gpx_path: Path) -> list[tuple[float, float, float | None]]:
    root = ET.parse(gpx_path).getroot()
    points = collect_points(root, detect_namespace(root))
    if not points:
        raise ValueError("No route coordinates found in GPX")
    return points


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def meter_grid(lat: float, lng: float, size_m: int = 1000) -> str:
    lat_m = lat * 111_320.0
    lng_m = lng * 111_320.0 * math.cos(math.radians(lat))
    return f"{round(lat_m / size_m)}:{round(lng_m / size_m)}:{size_m}"


def quantize_bbox(*, min_lat: float, min_lng: float, max_lat: float, max_lng: float, precision: int = 2) -> str:
    return ",".join(
        [
            f"{round(min_lat, precision):.{precision}f}",
            f"{round(min_lng, precision):.{precision}f}",
            f"{round(max_lat, precision):.{precision}f}",
            f"{round(max_lng, precision):.{precision}f}",
        ]
    )


def sample_indices(length: int, sample_count: int) -> list[int]:
    if length <= sample_count:
        return list(range(length))
    last = length - 1
    return sorted({round(i * last / (sample_count - 1)) for i in range(sample_count)})


def normalize_sampled_points(
    points: list[tuple[float, float, float | None]],
    *,
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    sample_count: int,
) -> list[list[int]]:
    lat_span = max(max_lat - min_lat, 1e-9)
    lng_span = max(max_lng - min_lng, 1e-9)
    sampled: list[list[int]] = []
    for idx in sample_indices(len(points), sample_count):
        lat, lng, _ = points[idx]
        x = int(round((lng - min_lng) / lng_span * 1000))
        y = int(round((lat - min_lat) / lat_span * 1000))
        sampled.append([x, y])
    return sampled


def canonical_shape_hash(sampled_points: list[list[int]]) -> str:
    forward = "|".join(f"{x}:{y}" for x, y in sampled_points)
    reverse = "|".join(f"{x}:{y}" for x, y in reversed(sampled_points))
    canonical = min(forward, reverse)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()


def distance_bin(distance_km: float) -> str:
    lower = int(math.floor(distance_km / 5.0) * 5)
    upper = lower + 5
    return f"{lower:03d}-{upper:03d}km"


def elevation_bin(elevation_gain_m: float) -> str:
    lower = int(math.floor(elevation_gain_m / 100.0) * 100)
    upper = lower + 100
    return f"{lower:04d}-{upper:04d}m"


def is_loop_route(distance_km: float, start_end_distance_m: float) -> bool:
    threshold_m = min(max(distance_km * 120.0, 1000.0), 3000.0)
    return start_end_distance_m <= threshold_m


def build_candidate_buckets(
    *,
    region_scope: str,
    start_grid: str,
    end_grid: str,
    bbox_hash: str,
    shape_hash: str,
    distance_bucket: str,
    elevation_bucket: str,
    loop_flag: str,
) -> list[tuple[str, str]]:
    unordered_pair = "~".join(sorted([start_grid, end_grid]))
    return [
        ("start_grid", f"{region_scope}|start:{start_grid}|dist:{distance_bucket}|loop:{loop_flag}"),
        ("grid_pair", f"{region_scope}|pair:{unordered_pair}|dist:{distance_bucket}|elev:{elevation_bucket}"),
        ("bbox", f"{region_scope}|bbox:{bbox_hash[:12]}|dist:{distance_bucket}"),
        ("shape", f"{region_scope}|shape:{shape_hash[:12]}|dist:{distance_bucket}|loop:{loop_flag}"),
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate route fingerprints and candidate buckets")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Only fingerprint the first N eligible rows")
    parser.add_argument("--sample-points", type=int, default=24, help="Number of normalized points to persist per route")
    parser.add_argument("--force", action="store_true", help="Recompute rows that already have route_fingerprint entries")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")
    if not SCHEMA_PATH.exists():
        raise SystemExit(f"Schema file not found: {SCHEMA_PATH}")

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)

    query = """
      SELECT
        rc.course_id,
        rc.gpx_path,
        cg.start_lat,
        cg.start_lng,
        cg.end_lat,
        cg.end_lng,
        cg.bbox_min_lat,
        cg.bbox_min_lng,
        cg.bbox_max_lat,
        cg.bbox_max_lng,
        cg.distance_km,
        cg.elevation_gain_m,
        cg.point_count,
        cg.route_hash,
        aam.is_korea,
        aam.sido_code,
        aam.sigungu_code
      FROM raw_course rc
      JOIN course_geometry cg ON cg.course_id = rc.course_id
      LEFT JOIN admin_area_match aam ON aam.course_id = rc.course_id
      WHERE cg.parse_status = 'parsed'
    """
    params: list[object] = []
    if not args.force:
        query += " AND NOT EXISTS (SELECT 1 FROM route_fingerprint rf WHERE rf.course_id = rc.course_id)"
    query += " ORDER BY rc.course_id"
    if args.limit is not None:
        query += " LIMIT ?"
        params.append(args.limit)

    rows = connection.execute(query, params).fetchall()

    processed = 0
    bucket_rows = 0
    failures = 0

    with connection:
        for row in rows:
            processed += 1
            course_id = int(row["course_id"])
            try:
                points = load_points(Path(row["gpx_path"]))
                sampled_points = normalize_sampled_points(
                    points,
                    min_lat=float(row["bbox_min_lat"]),
                    min_lng=float(row["bbox_min_lng"]),
                    max_lat=float(row["bbox_max_lat"]),
                    max_lng=float(row["bbox_max_lng"]),
                    sample_count=args.sample_points,
                )

                start_grid = meter_grid(float(row["start_lat"]), float(row["start_lng"]))
                end_grid = meter_grid(float(row["end_lat"]), float(row["end_lng"]))
                bbox_value = quantize_bbox(
                    min_lat=float(row["bbox_min_lat"]),
                    min_lng=float(row["bbox_min_lng"]),
                    max_lat=float(row["bbox_max_lat"]),
                    max_lng=float(row["bbox_max_lng"]),
                )
                bbox_hash = hashlib.sha1(bbox_value.encode("utf-8")).hexdigest()
                shape_hash = canonical_shape_hash(sampled_points)
                start_end_distance_m = round(
                    haversine_km(
                        float(row["start_lat"]),
                        float(row["start_lng"]),
                        float(row["end_lat"]),
                        float(row["end_lng"]),
                    )
                    * 1000,
                    1,
                )
                distance_bucket = distance_bin(float(row["distance_km"]))
                elevation_bucket = elevation_bin(float(row["elevation_gain_m"]))
                loop_flag = "loop" if is_loop_route(float(row["distance_km"]), start_end_distance_m) else "linear"

                if row["is_korea"] == 1:
                    region_scope = str(row["sigungu_code"] or row["sido_code"] or "KR")
                else:
                    region_scope = "overseas"

                candidate_buckets = build_candidate_buckets(
                    region_scope=region_scope,
                    start_grid=start_grid,
                    end_grid=end_grid,
                    bbox_hash=bbox_hash,
                    shape_hash=shape_hash,
                    distance_bucket=distance_bucket,
                    elevation_bucket=elevation_bucket,
                    loop_flag=loop_flag,
                )

                metrics = {
                    "region_scope": region_scope,
                    "is_korea": row["is_korea"],
                    "sido_code": row["sido_code"],
                    "sigungu_code": row["sigungu_code"],
                    "distance_km": float(row["distance_km"]),
                    "distance_bucket": distance_bucket,
                    "elevation_gain_m": float(row["elevation_gain_m"]),
                    "elevation_bucket": elevation_bucket,
                    "point_count": int(row["point_count"]),
                    "sample_point_count": len(sampled_points),
                    "start_end_distance_m": start_end_distance_m,
                    "loop_flag": loop_flag,
                    "route_hash": row["route_hash"],
                    "candidate_buckets": [bucket_key for _, bucket_key in candidate_buckets],
                }

                ts = now_iso()
                connection.execute(
                    """
                    INSERT INTO route_fingerprint (
                      course_id, start_grid, end_grid, bbox_hash, simplified_polyline_hash,
                      sampled_points_json, metrics_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(course_id) DO UPDATE SET
                      start_grid = excluded.start_grid,
                      end_grid = excluded.end_grid,
                      bbox_hash = excluded.bbox_hash,
                      simplified_polyline_hash = excluded.simplified_polyline_hash,
                      sampled_points_json = excluded.sampled_points_json,
                      metrics_json = excluded.metrics_json,
                      updated_at = excluded.updated_at
                    """,
                    (
                        course_id,
                        start_grid,
                        end_grid,
                        bbox_hash,
                        shape_hash,
                        json.dumps(sampled_points, ensure_ascii=False),
                        json.dumps(metrics, ensure_ascii=False),
                        ts,
                        ts,
                    ),
                )

                connection.execute("DELETE FROM route_candidate_bucket WHERE course_id = ?", (course_id,))
                connection.executemany(
                    """
                    INSERT INTO route_candidate_bucket (course_id, bucket_key, bucket_type, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(course_id, bucket_key, bucket_type, ts) for bucket_type, bucket_key in candidate_buckets],
                )
                bucket_rows += len(candidate_buckets)
            except Exception:
                failures += 1

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "processedCourses": processed,
                "failedCourses": failures,
                "fingerprintedCourses": processed - failures,
                "bucketRows": bucket_rows,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
