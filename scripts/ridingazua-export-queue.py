#!/usr/bin/env python3
"""
Seed Supabase export queue records from Ridingazua staging data.

Phase 5 scope:
- prioritize Asan canonical / singleton Korean courses first
- prepare export payload drafts for later Supabase insertion
- keep actual upload/persist step out of scope
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
ASAN_SIGUNGU_CODE = "34040"
MAPPING_VERSION = 1


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def infer_difficulty(distance_km: float, elevation_gain_m: float) -> str:
    stress = distance_km + (elevation_gain_m / 120.0)
    if stress <= 40:
        return "easy"
    if stress <= 95:
        return "moderate"
    return "hard"


def estimate_duration_min(distance_km: float, difficulty: str) -> int:
    speed_kmh = {
        "easy": 20.0,
        "moderate": 17.0,
        "hard": 14.0,
    }[difficulty]
    return max(30, int(round(distance_km / speed_kmh * 60)))


def build_tags(*, sido_name: str | None, sigungu_name: str | None, priority_scope: str) -> list[str]:
    tags = ["ridingazua-import", "auto-curated"]
    if sido_name:
        tags.append(f"sido:{sido_name}")
    if sigungu_name:
        tags.append(f"sigungu:{sigungu_name}")
    tags.append(f"scope:{priority_scope}")
    return tags


def build_description(*, source_url: str, sido_name: str | None, sigungu_name: str | None, source_course_id: int) -> str:
    region = sigungu_name or sido_name or "지역 미분류"
    return f"Ridingazua 공개 코스 {source_course_id}에서 수집한 경로입니다. 시작 지역: {region}. 원본: {source_url}"


def build_theme(*, is_asan: bool, sigungu_name: str | None, sido_name: str | None) -> str | None:
    if is_asan:
        return "아산 로컬 라이딩"
    if sigungu_name:
        return f"{sigungu_name} 라이딩"
    if sido_name:
        return f"{sido_name} 라이딩"
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Supabase export queue drafts from staging DB")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=None, help="Only queue the first N eligible rows")
    parser.add_argument("--force", action="store_true", help="Rebuild queue rows even if they already exist")
    return parser.parse_args()


def ensure_queue_schema(connection: sqlite3.Connection) -> None:
    existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(curation_decision)")}
    if "export_approved" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN export_approved INTEGER NOT NULL DEFAULT 0")
    if "export_basis" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN export_basis TEXT")
    connection.commit()


def eligible_query(force: bool, limit: int | None) -> tuple[str, list[object]]:
    route_scope_expr = """
      COALESCE(
        cd.route_scope_label,
        CASE
          WHEN lower(rc.title) LIKE '%국토종주%' OR lower(rc.title) LIKE '%4대강%' OR lower(rc.title) LIKE '%동해안%' OR lower(rc.title) LIKE '%남해안%' OR lower(rc.title) LIKE '%서해안%' THEN 'cross_country'
          WHEN lower(rc.title) LIKE 'sr-%' OR lower(rc.title) LIKE 'c-%' OR lower(rc.title) LIKE 'pt-%' OR lower(rc.title) LIKE '%브레베%' OR lower(rc.title) LIKE '%brevet%' OR lower(rc.title) LIKE '%퍼머넌트%' THEN 'randonneurs'
          WHEN cg.distance_km >= 180 THEN 'national_endurance'
          ELSE 'local'
        END
      )
    """.strip()
    query = f"""
      WITH canonical_grouped AS (
        SELECT
          cd.course_id,
          cd.canonical_course_id,
          'group_canonical' AS selection_reason
        FROM curation_decision cd
        JOIN admin_area_match aam ON aam.course_id = cd.course_id
        JOIN course_geometry cg ON cg.course_id = cd.course_id
        WHERE cd.export_approved = 1
          AND cd.decision IN ('canonical_keep', 'split_out')
          AND aam.is_korea = 1
          AND cg.parse_status = 'parsed'
      ),
      approved_variants AS (
        SELECT
          cd.course_id,
          COALESCE(cd.canonical_course_id, cd.course_id) AS canonical_course_id,
          'approved_variant' AS selection_reason
        FROM curation_decision cd
        JOIN admin_area_match aam ON aam.course_id = cd.course_id
        JOIN course_geometry cg ON cg.course_id = cd.course_id
        WHERE cd.export_approved = 1
          AND cd.decision = 'keep_variant'
          AND aam.is_korea = 1
          AND cg.parse_status = 'parsed'
      ),
      selected AS (
        SELECT * FROM canonical_grouped
        UNION ALL
        SELECT * FROM approved_variants
      )
      SELECT
        sel.course_id,
        sel.canonical_course_id,
        sel.selection_reason,
        rc.source_url,
        rc.title,
        cd.override_title,
        {route_scope_expr} AS route_scope_label,
        rc.gpx_path,
        cg.start_lat,
        cg.start_lng,
        cg.distance_km,
        cg.elevation_gain_m,
        aam.country_code,
        aam.sido_code,
        aam.sido_name,
        aam.sigungu_code,
        aam.sigungu_name
      FROM selected sel
      JOIN raw_course rc ON rc.course_id = sel.course_id
      LEFT JOIN curation_decision cd ON cd.course_id = sel.course_id
      LEFT JOIN supabase_export_queue seq ON seq.course_id = sel.course_id
      JOIN course_geometry cg ON cg.course_id = sel.course_id
      JOIN admin_area_match aam ON aam.course_id = sel.course_id
      WHERE {route_scope_expr} = 'local'
        AND cg.distance_km < 200
    """
    params: list[object] = []
    if not force:
        query += " AND seq.course_id IS NULL"
    query += " ORDER BY CASE WHEN aam.sigungu_code = '34040' THEN 0 ELSE 1 END, aam.sigungu_code, sel.course_id"
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    return query, params


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    ensure_queue_schema(connection)

    query, params = eligible_query(args.force, args.limit)
    rows = connection.execute(query, params).fetchall()

    queued = 0
    asan_priority = 0
    national = 0

    with connection:
        for row in rows:
            course_id = int(row["course_id"])
            canonical_course_id = int(row["canonical_course_id"])
            is_asan = row["sigungu_code"] == ASAN_SIGUNGU_CODE
            priority_scope = "asan" if is_asan else "national"
            export_status = "priority_review" if is_asan else "national_review"
            if is_asan:
                asan_priority += 1
            else:
                national += 1

            title = (row["override_title"] or row["title"] or f"Imported course {course_id}").strip()
            difficulty = infer_difficulty(float(row["distance_km"]), float(row["elevation_gain_m"]))
            theme = build_theme(
                is_asan=is_asan,
                sigungu_name=row["sigungu_name"],
                sido_name=row["sido_name"],
            )
            tags = build_tags(
                sido_name=row["sido_name"],
                sigungu_name=row["sigungu_name"],
                priority_scope=priority_scope,
            )
            payload = {
                "mapping_version": MAPPING_VERSION,
                "selection_reason": row["selection_reason"],
                "priority_scope": priority_scope,
                "source_course_id": course_id,
                "canonical_course_id": canonical_course_id,
                "source_url": row["source_url"],
                "source_gpx_path": row["gpx_path"],
                "supabase_course_insert": {
                    "title": title,
                    "description": build_description(
                        source_url=row["source_url"],
                        sido_name=row["sido_name"],
                        sigungu_name=row["sigungu_name"],
                        source_course_id=course_id,
                    ),
                    "difficulty": difficulty,
                    "distance_km": round(float(row["distance_km"]), 2),
                    "elevation_gain_m": int(round(float(row["elevation_gain_m"]))),
                    "est_duration_min": estimate_duration_min(float(row["distance_km"]), difficulty),
                    "start_point_id": None,
                    "start_point": {
                        "lat": round(float(row["start_lat"]), 6),
                        "lng": round(float(row["start_lng"]), 6),
                    },
                    "route": None,
                    "gpx_url": None,
                    "theme": theme,
                    "tags": tags,
                    "created_by": None,
                    "uploader_name": "Ridingazua import",
                    "uploader_emoji": "🗺️",
                    "route_geojson": None,
                    "route_preview_points": None,
                    "route_render_metadata": None,
                    "metadata_history": [
                        {
                            "type": "create",
                            "actorUserId": "system:ridingazua-import",
                            "actorDisplayName": "Ridingazua import",
                            "timestamp": now_iso(),
                            "values": {
                                "title": title,
                                "description": build_description(
                                    source_url=row["source_url"],
                                    sido_name=row["sido_name"],
                                    sigungu_name=row["sigungu_name"],
                                    source_course_id=course_id,
                                ),
                                "difficulty": difficulty,
                                "theme": theme,
                                "tags": tags,
                                "start_point_id": None,
                            },
                        }
                    ],
                },
                "region": {
                    "country_code": row["country_code"],
                    "sido_code": row["sido_code"],
                    "sido_name": row["sido_name"],
                    "sigungu_code": row["sigungu_code"],
                    "sigungu_name": row["sigungu_name"],
                },
            }

            override_theme = "아산 로컬 라이딩" if is_asan else None
            connection.execute(
                """
                INSERT INTO supabase_export_queue (
                  course_id,
                  canonical_course_id,
                  export_status,
                  target_start_point_name,
                  target_region_scope,
                  override_title,
                  override_theme,
                  override_tags_json,
                  export_payload_json,
                  queued_at,
                  exported_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                ON CONFLICT(course_id) DO UPDATE SET
                  canonical_course_id = excluded.canonical_course_id,
                  export_status = excluded.export_status,
                  target_start_point_name = excluded.target_start_point_name,
                  target_region_scope = excluded.target_region_scope,
                  override_title = excluded.override_title,
                  override_theme = excluded.override_theme,
                  override_tags_json = excluded.override_tags_json,
                  export_payload_json = excluded.export_payload_json,
                  queued_at = excluded.queued_at,
                  exported_at = excluded.exported_at
                """,
                (
                    course_id,
                    canonical_course_id,
                    export_status,
                    row["sigungu_name"],
                    f"priority:{priority_scope}|sigungu:{row['sigungu_code']}",
                    row["override_title"],
                    override_theme,
                    json.dumps(tags, ensure_ascii=False),
                    json.dumps(payload, ensure_ascii=False),
                    now_iso(),
                ),
            )
            queued += 1

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "queuedCourses": queued,
                "asanPriorityCourses": asan_priority,
                "nationalCourses": national,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
