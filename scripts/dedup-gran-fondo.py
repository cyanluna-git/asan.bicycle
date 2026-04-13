#!/usr/bin/env python3
"""
Incremental deduplication for gran fondo + randonneurs standalone courses.

Unlike ridingazua-curation.py, this script:
  - Only processes gran fondo/randonneurs courses NOT yet in any group
  - Does NOT delete existing groups/decisions
  - Adds new groups/members incrementally
  - Sets curation_decision.decision for new groups

Run from project root:
  python3 scripts/dedup-gran-fondo.py [--dry-run] [--min-overlap N]
"""

from __future__ import annotations

import argparse
import math
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

DEFAULT_DB_PATH = Path("courses/ridingazua-public-gpx-20260308/ridingazua-staging.sqlite3")


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_008.8
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def ratio_delta(a: float, b: float) -> float:
    denom = max(abs(a), abs(b), 1.0)
    return abs(a - b) / denom


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

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
        p = self.parent[item]
        if p != item:
            self.parent[item] = self.find(p)
        return self.parent[item]

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

GRAN_FONDO_EXPR = "(lower(rc.title) LIKE '%그란폰도%' OR lower(rc.title) LIKE '%gran fondo%' OR lower(rc.title) LIKE '%granfondo%')"
RANDONNEURS_EXPR = """(
  lower(rc.title) LIKE '%란도너스%' OR lower(rc.title) LIKE '%랜도너스%'
  OR lower(rc.title) LIKE '%randonneur%' OR lower(rc.title) LIKE '%brevet%'
  OR lower(rc.title) LIKE '%브레베%' OR lower(rc.title) LIKE '%브레벳%'
  OR lower(rc.title) LIKE 'sr-%' OR lower(rc.title) LIKE '%-sr'
)"""


def load_candidates(conn: sqlite3.Connection) -> list[CourseInfo]:
    """Load gran fondo + randonneurs standalone courses with fingerprint data."""
    rows = conn.execute(f"""
    SELECT
      rc.course_id,
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
      rf.simplified_polyline_hash AS shape_hash
    FROM raw_course rc
    JOIN course_geometry cg ON cg.course_id = rc.course_id AND cg.parse_status = 'parsed'
    JOIN admin_area_match aam ON aam.course_id = rc.course_id AND aam.is_korea = 1
    JOIN route_fingerprint rf ON rf.course_id = rc.course_id
    WHERE rc.download_status = 'downloaded'
      AND rc.course_id NOT IN (
        SELECT course_id FROM group_member
      )
      AND ({GRAN_FONDO_EXPR} OR {RANDONNEURS_EXPR})
    """).fetchall()

    return [
        CourseInfo(
            course_id=int(r["course_id"]),
            sigungu_code=r["sigungu_code"],
            country_code=r["country_code"],
            is_korea=r["is_korea"],
            start_lat=float(r["start_lat"]),
            start_lng=float(r["start_lng"]),
            end_lat=float(r["end_lat"]),
            end_lng=float(r["end_lng"]),
            distance_km=float(r["distance_km"]),
            elevation_gain_m=float(r["elevation_gain_m"]),
            point_count=int(r["point_count"] or 0),
            file_size_bytes=r["file_size_bytes"],
            start_grid=r["start_grid"] or "",
            end_grid=r["end_grid"] or "",
            bbox_hash=r["bbox_hash"] or "",
            shape_hash=r["shape_hash"] or "",
        )
        for r in rows
    ]


def build_pairs(conn: sqlite3.Connection, candidate_ids: list[int], min_overlap: int) -> list[sqlite3.Row]:
    # Temp table approach to avoid huge IN() clause
    conn.execute("DROP TABLE IF EXISTS _dedup_ids")
    conn.execute("CREATE TEMP TABLE _dedup_ids (course_id INTEGER PRIMARY KEY)")
    conn.executemany("INSERT INTO _dedup_ids VALUES (?)", [(i,) for i in candidate_ids])
    rows = conn.execute(f"""
    SELECT
      a.course_id AS course_id_a,
      b.course_id AS course_id_b,
      COUNT(*) AS overlap_count,
      MIN(a.bucket_key) AS candidate_bucket
    FROM route_candidate_bucket a
    JOIN route_candidate_bucket b ON a.bucket_key = b.bucket_key AND a.course_id < b.course_id
    JOIN _dedup_ids sa ON sa.course_id = a.course_id
    JOIN _dedup_ids sb ON sb.course_id = b.course_id
    GROUP BY a.course_id, b.course_id
    HAVING COUNT(*) >= ?
    """, (min_overlap,)).fetchall()
    conn.execute("DROP TABLE IF EXISTS _dedup_ids")
    return rows


def compute_similarity(left: CourseInfo, right: CourseInfo, overlap: int) -> tuple[float, float, str]:
    start_m = haversine_m(left.start_lat, left.start_lng, right.start_lat, right.start_lng)
    end_m = haversine_m(left.end_lat, left.end_lng, right.end_lat, right.end_lng)
    dist_delta = ratio_delta(left.distance_km, right.distance_km)
    ele_delta = ratio_delta(left.elevation_gain_m, right.elevation_gain_m)
    shape_same = left.shape_hash == right.shape_hash
    bbox_same = left.bbox_hash == right.bbox_hash
    dir_grid = left.start_grid == right.start_grid and left.end_grid == right.end_grid
    rev_grid = left.start_grid == right.end_grid and left.end_grid == right.start_grid

    score = 0.0
    if shape_same:    score += 0.45
    if dir_grid:      score += 0.20
    elif rev_grid:    score += 0.16
    if bbox_same:     score += 0.10
    if start_m <= 250:  score += 0.10
    elif start_m <= 1000: score += 0.06
    if end_m <= 250:    score += 0.05
    elif end_m <= 1000: score += 0.03
    if dist_delta <= 0.03: score += 0.06
    elif dist_delta <= 0.08: score += 0.03
    if ele_delta <= 0.15: score += 0.03
    elif ele_delta <= 0.30: score += 0.01
    if overlap >= 3: score += 0.04
    elif overlap >= 2: score += 0.02
    score = min(score, 0.99)

    # Strong spatial match without shape identity = near-duplicate
    strong_spatial = (
        bbox_same and dir_grid
        and start_m <= 500 and end_m <= 500
        and dist_delta <= 0.05
    )
    if shape_same and start_m <= 1000 and end_m <= 1000 and dist_delta <= 0.05 and ele_delta <= 0.25:
        hint = "duplicate"
    elif strong_spatial:
        hint = "duplicate"
    elif score >= 0.55:  # slightly lower than main pipeline (0.62) for this targeted pass
        hint = "variant"
    else:
        hint = "unrelated"

    return round(score, 3), round(start_m, 1), hint


def choose_canonical(courses: list[CourseInfo]) -> CourseInfo:
    return sorted(courses, key=lambda c: (
        -int(c.is_korea or 0),
        -(c.point_count or 0),
        -(c.file_size_bytes or 0),
        c.course_id,
    ))[0]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--min-overlap", type=int, default=1)
    p.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    return p.parse_args()


def build_bbox_groups(conn: sqlite3.Connection, candidate_ids: list[int]) -> list[tuple[int, int]]:
    """
    Pass 2: group courses by shared bbox_hash + sigungu_code + distance band.
    Catches near-identical routes that differ only in start_grid by 1 tile.
    """
    conn.execute("DROP TABLE IF EXISTS _dedup_ids2")
    conn.execute("CREATE TEMP TABLE _dedup_ids2 (course_id INTEGER PRIMARY KEY)")
    conn.executemany("INSERT INTO _dedup_ids2 VALUES (?)", [(i,) for i in candidate_ids])

    rows = conn.execute("""
    SELECT rf_a.course_id AS id_a, rf_b.course_id AS id_b
    FROM route_fingerprint rf_a
    JOIN route_fingerprint rf_b
      ON rf_a.bbox_hash = rf_b.bbox_hash
     AND rf_a.course_id < rf_b.course_id
    JOIN course_geometry cg_a ON cg_a.course_id = rf_a.course_id
    JOIN course_geometry cg_b ON cg_b.course_id = rf_b.course_id
    JOIN admin_area_match aam_a ON aam_a.course_id = rf_a.course_id
    JOIN admin_area_match aam_b ON aam_b.course_id = rf_b.course_id
    JOIN _dedup_ids2 da ON da.course_id = rf_a.course_id
    JOIN _dedup_ids2 db ON db.course_id = rf_b.course_id
    WHERE aam_a.sigungu_code = aam_b.sigungu_code
      AND ABS(cg_a.distance_km - cg_b.distance_km) / MAX(cg_a.distance_km, cg_b.distance_km, 1.0) < 0.08
    """).fetchall()

    conn.execute("DROP TABLE IF EXISTS _dedup_ids2")
    return [(int(r["id_a"]), int(r["id_b"])) for r in rows]


def main() -> int:
    args = parse_args()
    if not args.db_path.exists():
        raise SystemExit(f"DB not found: {args.db_path}")

    conn = sqlite3.connect(str(args.db_path))
    conn.row_factory = sqlite3.Row

    print("Loading candidates...")
    candidates = load_candidates(conn)
    course_map = {c.course_id: c for c in candidates}
    print(f"  {len(candidates)} standalone gran fondo/randonneurs with fingerprints")

    if not candidates:
        print("Nothing to process.")
        return 0

    print("Building candidate pairs (pass 1: shared buckets)...")
    pair_rows = build_pairs(conn, list(course_map.keys()), args.min_overlap)
    print(f"  {len(pair_rows)} candidate pairs found")

    # Score pairs and build graph
    graph_pairs: list[tuple[int, int]] = []
    dup_count = 0
    for row in pair_rows:
        left = course_map[int(row["course_id_a"])]
        right = course_map[int(row["course_id_b"])]
        score, start_m, hint = compute_similarity(left, right, int(row["overlap_count"]))
        if hint in ("duplicate", "variant"):
            graph_pairs.append((left.course_id, right.course_id))
            if hint == "duplicate":
                dup_count += 1

    print(f"  {len(graph_pairs)} similar pairs (of which {dup_count} duplicates)")

    print("Building candidate pairs (pass 2: bbox+sigungu+distance)...")
    bbox_pairs = build_bbox_groups(conn, list(course_map.keys()))
    print(f"  {len(bbox_pairs)} bbox-based pairs")
    graph_pairs.extend(bbox_pairs)

    # Union-Find grouping
    uf = UnionFind(list(course_map.keys()))
    for a, b in graph_pairs:
        uf.union(a, b)

    components: dict[int, list[int]] = {}
    for cid in course_map:
        root = uf.find(cid)
        components.setdefault(root, []).append(cid)

    # Only groups with 2+ members
    new_groups = {root: ids for root, ids in components.items() if len(ids) >= 2}
    truly_standalone = [cid for root, ids in components.items() if len(ids) == 1 for cid in ids]

    print(f"\nResults:")
    print(f"  New duplicate groups: {len(new_groups)}")
    total_dupes = sum(len(ids) - 1 for ids in new_groups.values())
    print(f"  Duplicates to remove: {total_dupes}")
    print(f"  Unique after dedup: {len(new_groups) + len(truly_standalone)}")
    print(f"  (was {len(candidates)} before dedup)")

    if args.dry_run:
        print("\n--- DRY RUN: largest new groups ---")
        sorted_groups = sorted(new_groups.values(), key=len, reverse=True)[:10]
        for ids in sorted_groups:
            courses_in_group = [course_map[i] for i in ids]
            canonical = choose_canonical(courses_in_group)
            for c in sorted(courses_in_group, key=lambda x: x.course_id):
                marker = "★" if c.course_id == canonical.course_id else " "
                from_db = conn.execute("SELECT title FROM raw_course WHERE course_id=?", (c.course_id,)).fetchone()
                title = from_db["title"][:50] if from_db else "?"
                print(f"  {marker} [{c.course_id:6d}] {title:50s} {c.distance_km:.1f}km")
            print()
        return 0

    # Persist new groups
    ts = now_iso()
    groups_added = 0
    members_added = 0
    decisions_upserted = 0

    # Get current max group_id to avoid conflicts
    max_gid_row = conn.execute("SELECT MAX(group_id) FROM similar_course_group").fetchone()
    # group_id is auto-increment, no need to track

    with conn:
        for member_ids in new_groups.values():
            group_courses = [course_map[i] for i in member_ids]
            canonical = choose_canonical(group_courses)

            # Determine region scope
            if canonical.is_korea and canonical.sigungu_code:
                scope, country_code, sigungu_code = "sigungu", canonical.country_code or "KR", canonical.sigungu_code
            elif canonical.is_korea:
                scope, country_code, sigungu_code = "korea", canonical.country_code or "KR", None
            else:
                scope, country_code, sigungu_code = "overseas", canonical.country_code, None

            cursor = conn.execute("""
            INSERT INTO similar_course_group (
              canonical_course_id, region_scope, country_code, sigungu_code,
              status, member_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'auto', ?, ?, ?)
            """, (canonical.course_id, scope, country_code, sigungu_code, len(group_courses), ts, ts))
            group_id = int(cursor.lastrowid)
            groups_added += 1

            conn.executemany("""
            INSERT INTO group_member (group_id, course_id, role)
            VALUES (?, ?, ?)
            """, [
                (group_id, c.course_id, "canonical" if c.course_id == canonical.course_id else "member")
                for c in group_courses
            ])
            members_added += len(group_courses)

            # Upsert curation_decision for all members
            for c in group_courses:
                decision = "canonical_keep" if c.course_id == canonical.course_id else "drop_duplicate"
                conn.execute("""
                INSERT INTO curation_decision (
                  course_id, decision, canonical_course_id, merge_group_id,
                  reviewer, reason_code, reason_note, reviewed_at, updated_at
                ) VALUES (?, ?, ?, ?, 'system:dedup-gran-fondo', 'shared_bucket', NULL, ?, ?)
                ON CONFLICT(course_id) DO UPDATE SET
                  decision = excluded.decision,
                  canonical_course_id = excluded.canonical_course_id,
                  merge_group_id = excluded.merge_group_id,
                  reviewer = excluded.reviewer,
                  reason_code = excluded.reason_code,
                  updated_at = excluded.updated_at
                """, (c.course_id, decision, canonical.course_id, group_id, ts, ts))
                decisions_upserted += 1

        # Set curation_decision for truly standalone courses (no group)
        for cid in truly_standalone:
            conn.execute("""
            INSERT INTO curation_decision (
              course_id, decision, canonical_course_id,
              reviewer, reason_code, updated_at
            ) VALUES (?, 'canonical_keep', ?, 'system:dedup-gran-fondo', 'standalone', ?)
            ON CONFLICT(course_id) DO UPDATE SET
              decision = CASE WHEN decision = 'pending' THEN 'canonical_keep' ELSE decision END,
              updated_at = excluded.updated_at
            """, (cid, cid, ts))
            decisions_upserted += 1

    conn.close()
    print(f"\n✓ Groups added: {groups_added}")
    print(f"✓ Members added: {members_added}")
    print(f"✓ Decisions upserted: {decisions_upserted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
