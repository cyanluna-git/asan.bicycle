#!/usr/bin/env python3
"""
Enrich Ridingazua staged routes with OSM-based surface/trail classification.

Primary use case:
- classify grouped review routes as road / gravel / mtb / mixed
- flag routes that appear to include hiking-oriented path segments
"""

from __future__ import annotations

import argparse
import json
import math
import ssl
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import certifi


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
DEFAULT_SIGUNGU_CODE = "34040"
DEFAULT_RADIUS_M = 60.0
DEFAULT_SAMPLE_POINTS = 28
DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter"

UNPAVED_SURFACES = {
    "gravel",
    "fine_gravel",
    "compacted",
    "dirt",
    "earth",
    "ground",
    "mud",
    "sand",
    "pebblestone",
    "rock",
    "rocks",
    "woodchips",
    "grass",
    "grass_paver",
}
PAVED_SURFACES = {
    "paved",
    "asphalt",
    "concrete",
    "concrete:lanes",
    "concrete:plates",
    "paving_stones",
    "sett",
}
ROAD_HIGHWAYS = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "service",
    "living_street",
    "road",
}
TRAIL_HIGHWAYS = {"path", "footway", "bridleway", "steps"}


@dataclass
class CourseTarget:
    course_id: int
    gpx_path: str


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich staged routes with OSM-based surface profiles")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--sigungu-code", default=DEFAULT_SIGUNGU_CODE)
    parser.add_argument("--course-id", type=int, action="append", default=[])
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--radius-m", type=float, default=DEFAULT_RADIUS_M)
    parser.add_argument("--sample-points", type=int, default=DEFAULT_SAMPLE_POINTS)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--sleep-ms", type=int, default=250)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def detect_namespace(root: ET.Element) -> str | None:
    tag = root.tag or ""
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return None


def collect_points(root: ET.Element, namespace: str | None) -> list[tuple[float, float]]:
    if namespace:
        paths = [f".//{{{namespace}}}trkpt", f".//{{{namespace}}}rtept", f".//{{{namespace}}}wpt"]
    else:
        paths = [".//trkpt", ".//rtept", ".//wpt"]
    ordered: list[ET.Element] = []
    for path in paths:
        ordered = root.findall(path)
        if ordered:
            break
    points: list[tuple[float, float]] = []
    for element in ordered:
        lat_raw = element.get("lat")
        lon_raw = element.get("lon")
        if lat_raw is None or lon_raw is None:
            continue
        points.append((float(lat_raw), float(lon_raw)))
    if not points:
        raise ValueError("No route points found")
    return points


def load_route_points(gpx_path: Path) -> list[tuple[float, float]]:
    root = ET.parse(gpx_path).getroot()
    return collect_points(root, detect_namespace(root))


def sample_points(points: list[tuple[float, float]], max_points: int) -> list[tuple[float, float]]:
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / max(max_points - 1, 1)
    sampled = [points[round(index * step)] for index in range(max_points)]
    deduped: list[tuple[float, float]] = []
    seen: set[tuple[int, int]] = set()
    for lat, lng in sampled:
        key = (round(lat * 100000), round(lng * 100000))
        if key in seen:
            continue
        seen.add(key)
        deduped.append((lat, lng))
    return deduped


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS route_surface_profile (
          course_id               INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
          sample_point_count      INTEGER NOT NULL DEFAULT 0,
          matched_point_count     INTEGER NOT NULL DEFAULT 0,
          nearest_threshold_m     REAL,
          paved_share             REAL,
          cycleway_share          REAL,
          gravel_share            REAL,
          trail_share             REAL,
          hiking_risk_share       REAL,
          dominant_surface_label  TEXT,
          confidence              REAL,
          flags_json              TEXT,
          raw_summary_json        TEXT,
          source                  TEXT NOT NULL DEFAULT 'osm_overpass',
          created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_route_surface_profile_label
          ON route_surface_profile(dominant_surface_label);
        """
    )
    connection.commit()


def load_targets(
    connection: sqlite3.Connection,
    sigungu_code: str,
    course_ids: list[int],
    limit: int | None,
    force: bool,
) -> list[CourseTarget]:
    if course_ids:
        placeholders = ",".join("?" for _ in course_ids)
        query = f"""
          SELECT rc.course_id, rc.gpx_path
          FROM raw_course rc
          JOIN course_geometry cg ON cg.course_id = rc.course_id
          WHERE rc.course_id IN ({placeholders})
            AND cg.parse_status = 'parsed'
        """
        rows = connection.execute(query, course_ids).fetchall()
        return [CourseTarget(course_id=int(row["course_id"]), gpx_path=str(row["gpx_path"])) for row in rows]

    params: list[object] = [sigungu_code]
    profile_clause = ""
    if not force:
        profile_clause = "AND rsp.course_id IS NULL"
    limit_clause = ""
    if limit is not None:
        limit_clause = "LIMIT ?"
        params.append(limit)

    query = f"""
      SELECT DISTINCT rc.course_id, rc.gpx_path
      FROM group_member gm
      JOIN similar_course_group scg ON scg.group_id = gm.group_id
      JOIN raw_course rc ON rc.course_id = gm.course_id
      JOIN course_geometry cg ON cg.course_id = gm.course_id
      LEFT JOIN route_surface_profile rsp ON rsp.course_id = gm.course_id
      WHERE scg.sigungu_code = ?
        AND cg.parse_status = 'parsed'
        {profile_clause}
      ORDER BY rc.course_id
      {limit_clause}
    """
    rows = connection.execute(query, params).fetchall()
    return [CourseTarget(course_id=int(row["course_id"]), gpx_path=str(row["gpx_path"])) for row in rows]


def build_overpass_query(points: list[tuple[float, float]], radius_m: float) -> str:
    around_clauses = "\n".join(
        f'  way["highway"](around:{radius_m:.0f},{lat:.6f},{lng:.6f});' for lat, lng in points
    )
    return f"""
[out:json][timeout:60];
(
{around_clauses}
);
out tags geom qt;
""".strip()


def fetch_overpass(query: str, endpoint: str) -> dict:
    encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=encoded,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            "User-Agent": "asan-bicycle-ridingazua-osm-surface/1.0",
        },
        method="POST",
    )
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(request, timeout=120, context=ssl_context) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_overpass_for_route(
    points: list[tuple[float, float]],
    radius_m: float,
    endpoint: str,
) -> tuple[dict, int]:
    sample_sizes = []
    if points:
        sample_sizes.append(len(points))
        if len(points) > 10:
            sample_sizes.append(max(10, len(points) // 2))
        if len(points) > 14:
            sample_sizes.append(max(8, len(points) // 3))
    seen: set[int] = set()
    last_error: Exception | None = None
    for sample_size in sample_sizes:
        if sample_size in seen:
            continue
        seen.add(sample_size)
        query = build_overpass_query(points[:sample_size], radius_m)
        try:
            return fetch_overpass(query, endpoint), sample_size
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 504}:
                raise
            time.sleep(1.0)
    if last_error is not None:
        raise last_error
    raise RuntimeError("No sample points available for Overpass query")


def meters_per_degree_lat() -> float:
    return 111_320.0


def meters_per_degree_lng(lat: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat))


def point_to_segment_distance_m(
    point: tuple[float, float],
    seg_a: tuple[float, float],
    seg_b: tuple[float, float],
) -> float:
    lat0 = point[0]
    scale_x = meters_per_degree_lng(lat0)
    scale_y = meters_per_degree_lat()
    px = point[1] * scale_x
    py = point[0] * scale_y
    ax = seg_a[1] * scale_x
    ay = seg_a[0] * scale_y
    bx = seg_b[1] * scale_x
    by = seg_b[0] * scale_y
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab_len_sq = abx * abx + aby * aby
    if ab_len_sq <= 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (apx * abx + apy * aby) / ab_len_sq))
    cx = ax + t * abx
    cy = ay + t * aby
    return math.hypot(px - cx, py - cy)


def classify_way(tags: dict[str, str]) -> str:
    highway = (tags.get("highway") or "").lower()
    surface = (tags.get("surface") or "").lower()
    bicycle = (tags.get("bicycle") or "").lower()
    sac_scale = (tags.get("sac_scale") or "").lower()
    mtb_scale = (tags.get("mtb:scale") or "").lower()
    tracktype = (tags.get("tracktype") or "").lower()

    if highway == "cycleway":
        return "cycleway"

    if highway in TRAIL_HIGHWAYS:
        if highway in {"footway", "steps"} and bicycle not in {"yes", "designated", "permissive", "official"}:
            return "hiking_risk"
        if sac_scale or mtb_scale:
            return "trail"
        if surface in UNPAVED_SURFACES:
            return "trail"
        if bicycle in {"yes", "designated", "permissive", "official"} and surface in PAVED_SURFACES:
            return "cycleway"
        return "trail"

    if highway == "track" or tracktype in {"grade2", "grade3", "grade4", "grade5"}:
        return "gravel" if surface not in PAVED_SURFACES else "paved_road"

    if surface in UNPAVED_SURFACES:
        return "gravel"

    if surface in PAVED_SURFACES and highway in ROAD_HIGHWAYS:
        return "paved_road"

    if highway in ROAD_HIGHWAYS:
        return "paved_road"

    if sac_scale or mtb_scale:
        return "trail"

    if highway == "pedestrian":
        return "hiking_risk" if bicycle not in {"yes", "designated", "permissive", "official"} else "trail"

    return "other"


def match_points_to_categories(
    sampled_points: list[tuple[float, float]],
    overpass_data: dict,
    threshold_m: float,
) -> tuple[dict[str, int], int]:
    ways = [element for element in overpass_data.get("elements", []) if element.get("type") == "way" and element.get("geometry")]
    counts = {"paved_road": 0, "cycleway": 0, "gravel": 0, "trail": 0, "hiking_risk": 0, "other": 0}
    matched_points = 0
    for point in sampled_points:
        best_distance = None
        best_category = None
        for way in ways:
            geometry = way.get("geometry") or []
            if len(geometry) < 2:
                continue
            tags = way.get("tags") or {}
            category = classify_way(tags)
            for index in range(len(geometry) - 1):
                seg_a = (float(geometry[index]["lat"]), float(geometry[index]["lon"]))
                seg_b = (float(geometry[index + 1]["lat"]), float(geometry[index + 1]["lon"]))
                distance = point_to_segment_distance_m(point, seg_a, seg_b)
                if best_distance is None or distance < best_distance:
                    best_distance = distance
                    best_category = category
        if best_distance is not None and best_distance <= threshold_m and best_category is not None:
            counts[best_category] += 1
            matched_points += 1
    return counts, matched_points


def summarize_profile(counts: dict[str, int], sample_count: int, matched_count: int) -> tuple[str, float, dict[str, float], dict[str, object]]:
    denom = max(matched_count, 1)
    shares = {
        "paved": counts["paved_road"] / denom,
        "cycleway": counts["cycleway"] / denom,
        "gravel": counts["gravel"] / denom,
        "trail": counts["trail"] / denom,
        "hiking_risk": counts["hiking_risk"] / denom,
    }
    roadish = shares["paved"] + shares["cycleway"]
    trailish = shares["trail"] + shares["hiking_risk"]

    flags = {
        "low_match_coverage": matched_count < max(6, sample_count // 3),
        "hiking_risk": shares["hiking_risk"] >= 0.12,
        "trail_present": trailish >= 0.15,
        "gravel_present": shares["gravel"] >= 0.15,
    }

    if matched_count < max(4, sample_count // 4):
        label = "unknown"
    elif trailish >= 0.30:
        label = "mtb"
    elif shares["gravel"] >= 0.25 and trailish < 0.30:
        label = "gravel"
    elif roadish >= 0.80 and shares["gravel"] <= 0.20 and trailish <= 0.10:
        label = "road"
    else:
        label = "mixed"

    confidence = round(min(1.0, (matched_count / max(sample_count, 1)) * max(roadish, shares["gravel"], trailish, 0.35)), 3)
    return label, confidence, shares, flags


def upsert_profile(
    connection: sqlite3.Connection,
    course_id: int,
    sample_count: int,
    matched_count: int,
    threshold_m: float,
    shares: dict[str, float],
    label: str,
    confidence: float,
    flags: dict[str, object],
    raw_summary: dict[str, object],
) -> None:
    timestamp = utc_now()
    connection.execute(
        """
        INSERT INTO route_surface_profile (
          course_id,
          sample_point_count,
          matched_point_count,
          nearest_threshold_m,
          paved_share,
          cycleway_share,
          gravel_share,
          trail_share,
          hiking_risk_share,
          dominant_surface_label,
          confidence,
          flags_json,
          raw_summary_json,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'osm_overpass', ?, ?)
        ON CONFLICT(course_id) DO UPDATE SET
          sample_point_count = excluded.sample_point_count,
          matched_point_count = excluded.matched_point_count,
          nearest_threshold_m = excluded.nearest_threshold_m,
          paved_share = excluded.paved_share,
          cycleway_share = excluded.cycleway_share,
          gravel_share = excluded.gravel_share,
          trail_share = excluded.trail_share,
          hiking_risk_share = excluded.hiking_risk_share,
          dominant_surface_label = excluded.dominant_surface_label,
          confidence = excluded.confidence,
          flags_json = excluded.flags_json,
          raw_summary_json = excluded.raw_summary_json,
          source = excluded.source,
          updated_at = excluded.updated_at
        """,
        (
            course_id,
            sample_count,
            matched_count,
            threshold_m,
            shares["paved"],
            shares["cycleway"],
            shares["gravel"],
            shares["trail"],
            shares["hiking_risk"],
            label,
            confidence,
            json.dumps(flags, ensure_ascii=False),
            json.dumps(raw_summary, ensure_ascii=False),
            timestamp,
            timestamp,
        ),
    )


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)

    targets = load_targets(connection, args.sigungu_code, args.course_id, args.limit, args.force)
    if not targets:
        print(json.dumps({"dbPath": str(db_path), "processed": 0, "message": "No targets"}))
        return 0

    processed = 0
    failures: list[dict[str, object]] = []
    for target in targets:
        try:
            points = load_route_points(Path(target.gpx_path))
            sampled = sample_points(points, args.sample_points)
            overpass_data, query_point_count = fetch_overpass_for_route(sampled, args.radius_m, args.endpoint)
            effective_sampled = sampled[:query_point_count]
            counts, matched_count = match_points_to_categories(effective_sampled, overpass_data, args.radius_m)
            label, confidence, shares, flags = summarize_profile(counts, len(effective_sampled), matched_count)
            raw_summary = {
                "counts": counts,
                "shares": shares,
                "matched_point_count": matched_count,
                "sample_point_count": len(effective_sampled),
                "radius_m": args.radius_m,
                "endpoint": args.endpoint,
            }
            upsert_profile(
                connection,
                target.course_id,
                len(effective_sampled),
                matched_count,
                args.radius_m,
                shares,
                label,
                confidence,
                flags,
                raw_summary,
            )
            connection.commit()
            processed += 1
            time.sleep(max(args.sleep_ms, 0) / 1000)
        except (ValueError, ET.ParseError, urllib.error.URLError, TimeoutError) as exc:
            failures.append({"course_id": target.course_id, "error": str(exc)})

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "processed": processed,
                "failed": len(failures),
                "failures": failures[:10],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
