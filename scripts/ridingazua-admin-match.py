#!/usr/bin/env python3
"""
Classify staged Ridingazua courses by Korean admin area using course start points.

Phase 2 scope:
- download/cache Korea sido + sigungu GeoJSON boundaries
- exclude overseas courses based on Korea sido boundary membership
- classify Korean courses into sido / sigungu
- upsert admin_area_match rows in the local staging SQLite database

Usage:
  python3 scripts/ridingazua-admin-match.py
  python3 scripts/ridingazua-admin-match.py --db-path /tmp/ridingazua-stage.sqlite3
  python3 scripts/ridingazua-admin-match.py --limit 1000
  python3 scripts/ridingazua-admin-match.py --refresh-boundaries
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
DEFAULT_BOUNDARY_DIR = Path("data/korea-admin-boundaries")
BOUNDARY_INDEX_URL = "https://api.github.com/repos/southkorea/southkorea-maps/contents/kostat/2013/json"
COUNTRY_CODE_KR = "KR"
COUNTRY_NAME_KR = "대한민국"
SIDO_BOUNDARY_NAME = "skorea_provinces_geo.json"
SIGUNGU_BOUNDARY_NAME = "skorea_municipalities_geo.json"


@dataclass
class BoundaryFeature:
    code: str
    name: str
    geometry_type: str
    coordinates: list
    bbox: tuple[float, float, float, float]


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def run_curl_json(url: str) -> object:
    result = subprocess.run(
        ["curl", "-fsSL", url],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["curl", "-fsSL", url, "-o", str(destination)],
        check=True,
    )


def ensure_boundary_files(boundary_dir: Path, refresh: bool = False) -> dict[str, Path]:
    boundary_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = boundary_dir / "source-manifest.json"
    index_items = run_curl_json(BOUNDARY_INDEX_URL)
    if not isinstance(index_items, list):
        raise RuntimeError("Boundary index response was not a list")

    selected = [
        item
        for item in index_items
        if isinstance(item, dict)
        and item.get("type") == "file"
        and item.get("name") in {SIDO_BOUNDARY_NAME, SIGUNGU_BOUNDARY_NAME}
    ]
    files: dict[str, Path] = {}
    source_manifest: list[dict[str, object]] = []
    for item in selected:
        name = str(item["name"])
        destination = boundary_dir / name
        if refresh or not destination.exists():
            download_url = item.get("download_url")
            if not download_url:
                raise RuntimeError(f"Boundary file is missing download_url: {name}")
            download_file(str(download_url), destination)
        files[name] = destination
        source_manifest.append(
            {
                "name": name,
                "download_url": item.get("download_url"),
                "size": item.get("size"),
                "sha": item.get("sha"),
            }
        )

    manifest_path.write_text(
        json.dumps(
            {
                "source": "southkorea/southkorea-maps",
                "index_url": BOUNDARY_INDEX_URL,
                "downloaded_at": now_iso(),
                "files": source_manifest,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return files


def load_geojson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_positions(coords: list) -> list[tuple[float, float]]:
    positions: list[tuple[float, float]] = []

    def walk(node: list) -> None:
        if not node:
            return
        if isinstance(node[0], (int, float)) and len(node) >= 2:
            positions.append((float(node[0]), float(node[1])))
            return
        for child in node:
            if isinstance(child, list):
                walk(child)

    walk(coords)
    return positions


def bbox_from_coordinates(coords: list) -> tuple[float, float, float, float]:
    positions = iter_positions(coords)
    if not positions:
        raise ValueError("Boundary geometry contained no positions")
    min_lng = max_lng = positions[0][0]
    min_lat = max_lat = positions[0][1]
    for lng, lat in positions[1:]:
        min_lng = min(min_lng, lng)
        max_lng = max(max_lng, lng)
        min_lat = min(min_lat, lat)
        max_lat = max(max_lat, lat)
    return min_lng, min_lat, max_lng, max_lat


def build_feature_index(path: Path) -> list[BoundaryFeature]:
    geojson = load_geojson(path)
    features: list[BoundaryFeature] = []
    for feature in geojson.get("features", []):
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        code = str(props.get("code") or props.get("id") or "")
        name = str(props.get("name") or props.get("title") or "")
        coordinates = geometry.get("coordinates") or []
        geometry_type = str(geometry.get("type") or "")
        if not code or not name or not coordinates or not geometry_type:
            continue
        features.append(
            BoundaryFeature(
                code=code,
                name=name,
                geometry_type=geometry_type,
                coordinates=coordinates,
                bbox=bbox_from_coordinates(coordinates),
            )
        )
    return features


def point_in_bbox(lng: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    min_lng, min_lat, max_lng, max_lat = bbox
    return min_lng <= lng <= max_lng and min_lat <= lat <= max_lat


def point_in_ring(lng: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    count = len(ring)
    if count < 3:
        return False
    j = count - 1
    for i in range(count):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        intersects = ((yi > lat) != (yj > lat)) and (
            lng < ((xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi)
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_polygon(lng: float, lat: float, polygon: list[list[list[float]]]) -> bool:
    if not polygon:
        return False
    if not point_in_ring(lng, lat, polygon[0]):
        return False
    for hole in polygon[1:]:
        if point_in_ring(lng, lat, hole):
            return False
    return True


def point_in_geometry(lng: float, lat: float, feature: BoundaryFeature) -> bool:
    if not point_in_bbox(lng, lat, feature.bbox):
        return False
    if feature.geometry_type == "Polygon":
        return point_in_polygon(lng, lat, feature.coordinates)
    if feature.geometry_type == "MultiPolygon":
        return any(point_in_polygon(lng, lat, polygon) for polygon in feature.coordinates)
    return False


def match_feature(lng: float, lat: float, features: list[BoundaryFeature]) -> BoundaryFeature | None:
    for feature in features:
        if point_in_geometry(lng, lat, feature):
            return feature
    return None


def upsert_admin_area_match(
    connection: sqlite3.Connection,
    *,
    course_id: int,
    country_code: str | None,
    country_name: str | None,
    is_korea: int,
    sido: BoundaryFeature | None,
    sigungu: BoundaryFeature | None,
    match_method: str,
    match_confidence: float,
    raw_payload: dict,
) -> None:
    connection.execute(
        """
        INSERT INTO admin_area_match (
          course_id, country_code, country_name, is_korea, sido_code, sido_name,
          sigungu_code, sigungu_name, match_method, match_confidence,
          matched_at, raw_response_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(course_id) DO UPDATE SET
          country_code = excluded.country_code,
          country_name = excluded.country_name,
          is_korea = excluded.is_korea,
          sido_code = excluded.sido_code,
          sido_name = excluded.sido_name,
          sigungu_code = excluded.sigungu_code,
          sigungu_name = excluded.sigungu_name,
          match_method = excluded.match_method,
          match_confidence = excluded.match_confidence,
          matched_at = excluded.matched_at,
          raw_response_json = excluded.raw_response_json
        """,
        (
            course_id,
            country_code,
            country_name,
            is_korea,
            None if sido is None else sido.code,
            None if sido is None else sido.name,
            None if sigungu is None else sigungu.code,
            None if sigungu is None else sigungu.name,
            match_method,
            match_confidence,
            now_iso(),
            json.dumps(raw_payload, ensure_ascii=False),
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate admin_area_match using Korean boundary GeoJSON")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Directory containing the staging SQLite database by default",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="SQLite staging DB path (default: <source-dir>/ridingazua-staging.sqlite3)",
    )
    parser.add_argument(
        "--boundary-dir",
        type=Path,
        default=DEFAULT_BOUNDARY_DIR,
        help="Directory used to cache boundary GeoJSON files",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only classify the first N eligible rows")
    parser.add_argument(
        "--refresh-boundaries",
        action="store_true",
        help="Re-download cached boundary files before matching",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute rows that already have admin_area_match entries",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    boundary_dir = args.boundary_dir.resolve()

    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")

    files = ensure_boundary_files(boundary_dir, refresh=args.refresh_boundaries)
    sido_path = files.get(SIDO_BOUNDARY_NAME)
    if sido_path is None:
        raise SystemExit(f"Missing sido boundary file: {SIDO_BOUNDARY_NAME}")

    sido_features = build_feature_index(sido_path)
    sigungu_path = files.get(SIGUNGU_BOUNDARY_NAME)
    if sigungu_path is None:
        raise SystemExit(f"Missing sigungu boundary file: {SIGUNGU_BOUNDARY_NAME}")

    all_sigungu_features = build_feature_index(sigungu_path)
    sigungu_by_sido: dict[str, list[BoundaryFeature]] = {}
    for feature in all_sigungu_features:
        sigungu_by_sido.setdefault(feature.code[:2], []).append(feature)

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row

    query = """
      SELECT rc.course_id, rc.title, cg.start_lat, cg.start_lng
      FROM raw_course rc
      JOIN course_geometry cg ON cg.course_id = rc.course_id
      WHERE cg.parse_status = 'parsed'
        AND cg.start_lat IS NOT NULL
        AND cg.start_lng IS NOT NULL
    """
    params: list[object] = []
    if not args.force:
        query += " AND NOT EXISTS (SELECT 1 FROM admin_area_match aam WHERE aam.course_id = rc.course_id)"
    query += " ORDER BY rc.course_id"
    if args.limit is not None:
        query += " LIMIT ?"
        params.append(args.limit)

    rows = connection.execute(query, params).fetchall()

    processed = 0
    korea = 0
    overseas = 0
    sigungu_matched = 0
    sido_only = 0

    with connection:
        for row in rows:
            processed += 1
            course_id = int(row["course_id"])
            lat = float(row["start_lat"])
            lng = float(row["start_lng"])
            sido = match_feature(lng, lat, sido_features)
            if sido is None:
                overseas += 1
                upsert_admin_area_match(
                    connection,
                    course_id=course_id,
                    country_code=None,
                    country_name=None,
                    is_korea=0,
                    sido=None,
                    sigungu=None,
                    match_method="start_point_outside_korea",
                    match_confidence=1.0,
                    raw_payload={
                        "start_lat": lat,
                        "start_lng": lng,
                        "matched": False,
                    },
                )
                continue

            korea += 1
            sigungu_candidates = sigungu_by_sido.get(sido.code, [])
            sigungu = match_feature(lng, lat, sigungu_candidates)

            if sigungu is None:
                sido_only += 1
                match_method = "start_point_sido_polygon"
                match_confidence = 0.75
            else:
                sigungu_matched += 1
                match_method = "start_point_sigungu_polygon"
                match_confidence = 1.0

            upsert_admin_area_match(
                connection,
                course_id=course_id,
                country_code=COUNTRY_CODE_KR,
                country_name=COUNTRY_NAME_KR,
                is_korea=1,
                sido=sido,
                sigungu=sigungu,
                match_method=match_method,
                match_confidence=match_confidence,
                raw_payload={
                    "start_lat": lat,
                    "start_lng": lng,
                    "sido_boundary_file": sido_path.name,
                    "sigungu_boundary_file": sigungu_path.name,
                },
            )

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "boundaryDir": str(boundary_dir),
                "processedCourses": processed,
                "koreaCourses": korea,
                "overseasCourses": overseas,
                "sigunguMatched": sigungu_matched,
                "sidoOnlyMatched": sido_only,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
