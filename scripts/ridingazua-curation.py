#!/usr/bin/env python3
"""
Build similarity edges, groups, and review seeds for Ridingazua staging data.

Phase 4 scope:
- derive similarity edges from shared candidate buckets
- create auto groups for duplicate / strong-variant routes
- seed curation_decision rows for later manual review
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"


@dataclass
class CourseInfo:
    course_id: int
    sigungu_code: str | None
    country_code: str | None
    is_korea: int | None
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    distance_km: float
    elevation_gain_m: float
    point_count: int
    file_size_bytes: int | None
    start_grid: str
    end_grid: str
    bbox_hash: str
    shape_hash: str


class UnionFind:
    def __init__(self, items: list[int]) -> None:
        self.parent = {item: item for item in items}

    def find(self, item: int) -> int:
        parent = self.parent[item]
        if parent != item:
            self.parent[item] = self.find(parent)
        return self.parent[item]

    def union(self, left: int, right: int) -> None:
        root_left = self.find(left)
        root_right = self.find(right)
        if root_left != root_right:
            self.parent[root_right] = root_left


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_m = 6_371_008.8
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2
    return 2 * radius_m * math.asin(math.sqrt(a))


def ratio_delta(left: float, right: float) -> float:
    denominator = max(abs(left), abs(right), 1.0)
    return abs(left - right) / denominator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build similarity groups and curation seeds from route fingerprints")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Only include the first N fingerprinted courses")
    parser.add_argument("--min-overlap", type=int, default=2, help="Minimum shared bucket count required for comparison")
    return parser.parse_args()


def load_courses(connection: sqlite3.Connection, limit: int | None) -> list[CourseInfo]:
    query = """
      SELECT
        rf.course_id,
        aam.sigungu_code,
        aam.country_code,
        aam.is_korea,
        cg.start_lat,
        cg.start_lng,
        cg.end_lat,
        cg.end_lng,
        cg.distance_km,
        cg.elevation_gain_m,
        cg.point_count,
        rc.file_size_bytes,
        rf.start_grid,
        rf.end_grid,
        rf.bbox_hash,
        rf.simplified_polyline_hash
      FROM route_fingerprint rf
      JOIN course_geometry cg ON cg.course_id = rf.course_id
      JOIN raw_course rc ON rc.course_id = rf.course_id
      LEFT JOIN admin_area_match aam ON aam.course_id = rf.course_id
      ORDER BY rf.course_id
    """
    params: list[object] = []
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    rows = connection.execute(query, params).fetchall()
    return [
        CourseInfo(
            course_id=int(row["course_id"]),
            sigungu_code=row["sigungu_code"],
            country_code=row["country_code"],
            is_korea=row["is_korea"],
            start_lat=float(row["start_lat"]),
            start_lng=float(row["start_lng"]),
            end_lat=float(row["end_lat"]),
            end_lng=float(row["end_lng"]),
            distance_km=float(row["distance_km"]),
            elevation_gain_m=float(row["elevation_gain_m"]),
            point_count=int(row["point_count"]),
            file_size_bytes=row["file_size_bytes"],
            start_grid=str(row["start_grid"]),
            end_grid=str(row["end_grid"]),
            bbox_hash=str(row["bbox_hash"]),
            shape_hash=str(row["simplified_polyline_hash"]),
        )
        for row in rows
    ]


def build_candidate_pairs(connection: sqlite3.Connection, selected_ids: list[int], min_overlap: int) -> list[sqlite3.Row]:
    connection.execute("DROP TABLE IF EXISTS temp.selected_course_ids")
    connection.execute("CREATE TEMP TABLE selected_course_ids (course_id INTEGER PRIMARY KEY)")
    connection.executemany(
        "INSERT INTO selected_course_ids(course_id) VALUES (?)",
        [(course_id,) for course_id in selected_ids],
    )
    query = """
      SELECT
        a.course_id AS course_id_a,
        b.course_id AS course_id_b,
        COUNT(*) AS overlap_count,
        GROUP_CONCAT(DISTINCT a.bucket_type) AS shared_bucket_types,
        MIN(a.bucket_key) AS candidate_bucket
      FROM route_candidate_bucket a
      JOIN route_candidate_bucket b
        ON a.bucket_key = b.bucket_key
       AND a.course_id < b.course_id
      JOIN selected_course_ids sa ON sa.course_id = a.course_id
      JOIN selected_course_ids sb ON sb.course_id = b.course_id
      GROUP BY a.course_id, b.course_id
      HAVING COUNT(*) >= ?
    """
    return connection.execute(query, (min_overlap,)).fetchall()


def compute_similarity(left: CourseInfo, right: CourseInfo, overlap_count: int) -> tuple[float, float, int, str]:
    start_distance_m = haversine_m(left.start_lat, left.start_lng, right.start_lat, right.start_lng)
    end_distance_m = haversine_m(left.end_lat, left.end_lng, right.end_lat, right.end_lng)
    distance_delta = ratio_delta(left.distance_km, right.distance_km)
    elevation_delta = ratio_delta(left.elevation_gain_m, right.elevation_gain_m)
    shape_same = left.shape_hash == right.shape_hash
    bbox_same = left.bbox_hash == right.bbox_hash
    directional_grid_same = left.start_grid == right.start_grid and left.end_grid == right.end_grid
    reverse_grid_same = left.start_grid == right.end_grid and left.end_grid == right.start_grid
    same_sigungu = int(bool(left.sigungu_code and left.sigungu_code == right.sigungu_code))

    score = 0.0
    if shape_same:
      score += 0.45
    if directional_grid_same:
      score += 0.20
    elif reverse_grid_same:
      score += 0.16
    if bbox_same:
      score += 0.10
    if start_distance_m <= 250:
      score += 0.10
    elif start_distance_m <= 1000:
      score += 0.06
    if end_distance_m <= 250:
      score += 0.05
    elif end_distance_m <= 1000:
      score += 0.03
    if distance_delta <= 0.03:
      score += 0.06
    elif distance_delta <= 0.08:
      score += 0.03
    if elevation_delta <= 0.15:
      score += 0.03
    elif elevation_delta <= 0.30:
      score += 0.01
    if overlap_count >= 3:
      score += 0.04
    elif overlap_count >= 2:
      score += 0.02

    score = min(score, 0.99)
    if shape_same and start_distance_m <= 1000 and end_distance_m <= 1000 and distance_delta <= 0.05 and elevation_delta <= 0.25:
      decision_hint = "duplicate"
    elif score >= 0.62:
      decision_hint = "variant"
    else:
      decision_hint = "unrelated"
    return round(score, 3), round(start_distance_m, 1), same_sigungu, decision_hint


def choose_canonical(courses: list[CourseInfo]) -> CourseInfo:
    return sorted(
        courses,
        key=lambda course: (
            -int(course.is_korea or 0),
            -(course.point_count or 0),
            -(course.file_size_bytes or 0),
            course.course_id,
        ),
    )[0]


def region_scope(course: CourseInfo) -> tuple[str, str | None, str | None]:
    if course.is_korea and course.sigungu_code:
        return "sigungu", course.country_code or "KR", course.sigungu_code
    if course.is_korea:
        return "korea", course.country_code or "KR", None
    return "overseas", course.country_code, None


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row

    courses = load_courses(connection, args.limit)
    course_map = {course.course_id: course for course in courses}
    selected_ids = [course.course_id for course in courses]
    pair_rows = build_candidate_pairs(connection, selected_ids, args.min_overlap)

    kept_edges: list[tuple[int, int, str, float, float, int, str, str]] = []
    graph_pairs: list[tuple[int, int]] = []
    skipped_pairs = 0

    with connection:
        connection.execute("DELETE FROM similar_course_edge")
        connection.execute("DELETE FROM group_member")
        connection.execute("DELETE FROM similar_course_group")
        connection.execute("DELETE FROM curation_decision WHERE reviewer = 'system:auto'")

        for row in pair_rows:
            left = course_map[int(row["course_id_a"])]
            right = course_map[int(row["course_id_b"])]
            overlap_count = int(row["overlap_count"])
            score, start_distance_m, same_sigungu, decision_hint = compute_similarity(left, right, overlap_count)
            if decision_hint == "unrelated":
                skipped_pairs += 1
                continue
            shared_types = str(row["shared_bucket_types"] or "")
            candidate_bucket = str(row["candidate_bucket"] or "")
            kept_edges.append(
                (
                    left.course_id,
                    right.course_id,
                    candidate_bucket if candidate_bucket else shared_types,
                    score,
                    start_distance_m,
                    same_sigungu,
                    decision_hint,
                    now_iso(),
                )
            )
            graph_pairs.append((left.course_id, right.course_id))

        connection.executemany(
            """
            INSERT INTO similar_course_edge (
              course_id_a, course_id_b, candidate_bucket, similarity_score,
              start_distance_m, same_sigungu, decision_hint, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            kept_edges,
        )

        union_find = UnionFind(selected_ids)
        for left_id, right_id in graph_pairs:
            union_find.union(left_id, right_id)

        components: dict[int, list[int]] = {}
        for course_id in selected_ids:
            root = union_find.find(course_id)
            components.setdefault(root, []).append(course_id)

        group_count = 0
        seeded_decisions = 0
        for member_ids in components.values():
            if len(member_ids) < 2:
                continue
            component_courses = [course_map[course_id] for course_id in sorted(member_ids)]
            canonical = choose_canonical(component_courses)
            scope, country_code, sigungu_code = region_scope(canonical)
            ts = now_iso()
            cursor = connection.execute(
                """
                INSERT INTO similar_course_group (
                  canonical_course_id, region_scope, country_code, sigungu_code,
                  status, member_count, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'auto', ?, ?, ?)
                """,
                (
                    canonical.course_id,
                    scope,
                    country_code,
                    sigungu_code,
                    len(component_courses),
                    ts,
                    ts,
                ),
            )
            group_id = int(cursor.lastrowid)
            group_count += 1

            connection.executemany(
                """
                INSERT INTO group_member (group_id, course_id, role)
                VALUES (?, ?, ?)
                """,
                [
                    (group_id, course.course_id, "canonical" if course.course_id == canonical.course_id else "member")
                    for course in component_courses
                ],
            )

            connection.executemany(
                """
                INSERT INTO curation_decision (
                  course_id, decision, canonical_course_id, merge_group_id,
                  reviewer, reason_code, reason_note, reviewed_at, updated_at
                )
                VALUES (?, 'pending', ?, ?, 'system:auto', ?, ?, NULL, ?)
                ON CONFLICT(course_id) DO UPDATE SET
                  decision = excluded.decision,
                  canonical_course_id = excluded.canonical_course_id,
                  merge_group_id = excluded.merge_group_id,
                  reviewer = excluded.reviewer,
                  reason_code = excluded.reason_code,
                  reason_note = excluded.reason_note,
                  reviewed_at = excluded.reviewed_at,
                  updated_at = excluded.updated_at
                """,
                [
                    (
                        course.course_id,
                        canonical.course_id,
                        group_id,
                        "auto_canonical_candidate" if course.course_id == canonical.course_id else "auto_similarity_review",
                        f"Auto-grouped with {len(component_courses)} candidate members; review duplicate/variant merge decision.",
                        ts,
                    )
                    for course in component_courses
                ],
            )
            seeded_decisions += len(component_courses)

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "selectedCourses": len(selected_ids),
                "candidatePairs": len(pair_rows),
                "keptEdges": len(kept_edges),
                "skippedPairs": skipped_pairs,
                "groups": group_count,
                "seededDecisions": seeded_decisions,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
