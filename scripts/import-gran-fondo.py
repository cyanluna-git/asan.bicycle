#!/usr/bin/env python3
"""
Import gran fondo and randonneurs courses from local SQLite staging DB to Supabase.

Selects:
  - Gran fondo: canonical (in group, role='canonical') + standalone (no group membership)
  - Randonneurs/SR/Brevet: same selection logic

Filters applied:
  - download_status = 'downloaded'
  - parse_status = 'parsed'
  - is_korea = 1

Run from project root:
  python3 scripts/import-gran-fondo.py [--dry-run] [--limit N] [--category gran_fondo|randonneurs|all]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

# Load env from .env.local
def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_file = Path(".env.local")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    env.update(os.environ)
    return env


DEFAULT_DB_PATH = Path("courses/ridingazua-public-gpx-20260308/ridingazua-staging.sqlite3")
BATCH_SIZE = 20


# ---------------------------------------------------------------------------
# GPX parsing
# ---------------------------------------------------------------------------

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

    pts = root.findall(trkpt_path)
    if not pts:
        pts = root.findall(rtept_path)
    if not pts:
        pts = root.findall(wpt_path)

    points: list[tuple[float, float, float | None]] = []
    for el in pts:
        lat_raw = el.get("lat")
        lng_raw = el.get("lon")
        if lat_raw is None or lng_raw is None:
            continue
        ele_el = el.find(ele_tag)
        ele = float(ele_el.text) if ele_el is not None and ele_el.text else None
        points.append((float(lat_raw), float(lng_raw), ele))
    return points


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def smooth_elevations(eles: list[float], window: int = 5) -> list[float]:
    if len(eles) < window:
        return eles
    result: list[float] = []
    for i in range(len(eles)):
        lo = max(0, i - window // 2)
        hi = min(len(eles) - 1, i + window // 2)
        result.append(sum(eles[lo : hi + 1]) / (hi - lo + 1))
    return result


def calc_elevation_gain(points: list[tuple[float, float, float | None]]) -> float:
    eles = [p[2] for p in points if p[2] is not None]
    if len(eles) < 2:
        return 0.0
    smoothed = smooth_elevations(eles)
    gain = 0.0
    for i in range(1, len(smoothed)):
        delta = smoothed[i] - smoothed[i - 1]
        if delta > 0:
            gain += delta
    return round(gain)


def downsample_points(points: list[tuple[float, float, float | None]], max_pts: int = 200) -> list[tuple[float, float]]:
    """Return at most max_pts evenly-spaced lat/lng points."""
    if len(points) <= max_pts:
        return [(p[0], p[1]) for p in points]
    step = len(points) / max_pts
    return [(points[round(i * step)][0], points[round(i * step)][1]) for i in range(max_pts)]


MAX_HOVER_POINTS = 500    # cap hoverProfile — 충분한 elevation chart 해상도


def build_geojson(points: list[tuple[float, float, float | None]], distance_km: float = 0.0) -> dict:
    # Full resolution — route_geojson은 지도 렌더링용이라 다운샘플 안 함
    coords = []
    for lat, lng, ele in points:
        if ele is not None:
            coords.append([round(lng, 6), round(lat, 6), round(ele, 1)])
        else:
            coords.append([round(lng, 6), round(lat, 6)])
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        ],
    }


def build_render_metadata(points: list[tuple[float, float, float | None]]) -> dict:
    if not points:
        return {"version": 1, "bounds": None, "hoverProfile": [], "slopeSegments": []}

    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    bounds = {
        "minLat": min(lats),
        "maxLat": max(lats),
        "minLng": min(lngs),
        "maxLng": max(lngs),
    }

    # Build hover profile — downsample to MAX_HOVER_POINTS for storage efficiency
    hover_pts = points
    if len(points) > MAX_HOVER_POINTS:
        step = len(points) / MAX_HOVER_POINTS
        hover_pts = [points[round(i * step)] for i in range(MAX_HOVER_POINTS)]

    hover_profile = []
    cum_km = 0.0
    for i, (lat, lng, ele) in enumerate(hover_pts):
        if i > 0:
            cum_km += haversine_km(hover_pts[i - 1][0], hover_pts[i - 1][1], lat, lng)
        if ele is not None:
            hover_profile.append({
                "distanceKm": round(cum_km * 100) / 100,
                "elevationM": round(ele * 10) / 10,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
            })

    # Build slope segments (every 1km)
    slope_segments = []
    if len(hover_profile) >= 2:
        seg_start_km = 0.0
        seg_end_km = 1.0
        seg_start_ele = hover_profile[0]["elevationM"]
        while seg_end_km <= hover_profile[-1]["distanceKm"] + 0.5:
            # Find elevation at seg_end_km
            end_pt = next((p for p in hover_profile if p["distanceKm"] >= seg_end_km), hover_profile[-1])
            start_pt = next((p for p in reversed(hover_profile) if p["distanceKm"] <= seg_start_km), hover_profile[0])
            dist_m = (end_pt["distanceKm"] - start_pt["distanceKm"]) * 1000
            if dist_m > 0:
                slope_pct = (end_pt["elevationM"] - start_pt["elevationM"]) / dist_m * 100
                slope_segments.append({
                    "startKm": round(seg_start_km, 2),
                    "endKm": round(seg_end_km, 2),
                    "slopePct": round(slope_pct, 1),
                })
            seg_start_km = seg_end_km
            seg_end_km += 1.0
            seg_start_ele = end_pt["elevationM"]

    return {
        "version": 1,
        "bounds": bounds,
        "hoverProfile": hover_profile,
        "slopeSegments": slope_segments,
    }


def parse_gpx(gpx_path: Path) -> dict | None:
    try:
        root = ET.parse(gpx_path).getroot()
        ns = detect_namespace(root)
        points = collect_points(root, ns)
        if not points:
            return None

        distance_km = 0.0
        for i in range(1, len(points)):
            distance_km += haversine_km(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
        distance_km = round(distance_km * 10) / 10

        elevation_gain_m = calc_elevation_gain(points)
        preview_pts = downsample_points(points, 200)
        geojson = build_geojson(points)
        render_metadata = build_render_metadata(points)

        return {
            "start_lat": points[0][0],
            "start_lng": points[0][1],
            "distance_km": distance_km,
            "elevation_gain_m": elevation_gain_m,
            "preview_points": [{"lat": lat, "lng": lng} for lat, lng in preview_pts],
            "geojson": geojson,
            "render_metadata": render_metadata,
        }
    except Exception as e:
        print(f"  [WARN] GPX parse failed {gpx_path.name}: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Course metadata helpers
# ---------------------------------------------------------------------------

def infer_difficulty(distance_km: float, elevation_gain_m: float) -> str:
    stress = distance_km + elevation_gain_m / 120.0
    if stress <= 40:
        return "easy"
    if stress <= 95:
        return "moderate"
    return "hard"


def estimate_duration_min(distance_km: float, difficulty: str) -> int:
    speed = {"easy": 20.0, "moderate": 17.0, "hard": 14.0}[difficulty]
    return max(30, round(distance_km / speed * 60))


def build_theme(category: str, sigungu_name: str | None, sido_name: str | None) -> str:
    if category == "gran_fondo":
        return "그란폰도"
    if category == "randonneurs":
        return "랜도너스"
    if sigungu_name:
        return f"{sigungu_name} 라이딩"
    if sido_name:
        return f"{sido_name} 라이딩"
    return "장거리 라이딩"


def build_tags(category: str, sido_name: str | None, sigungu_name: str | None) -> list[str]:
    tags = ["ridingazua-import", "auto-curated"]
    if category == "gran_fondo":
        tags.append("그란폰도")
    elif category == "randonneurs":
        tags.append("랜도너스")
    if sido_name:
        tags.append(f"sido:{sido_name}")
    if sigungu_name:
        tags.append(f"sigungu:{sigungu_name}")
    return tags


def build_description(source_url: str, sido_name: str | None, sigungu_name: str | None, source_course_id: int) -> str:
    region = sigungu_name or sido_name or "지역 미분류"
    return f"Ridingazua 공개 코스 {source_course_id}에서 수집한 경로입니다. 시작 지역: {region}. 원본: {source_url}"


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------
# SQLite queries
# ---------------------------------------------------------------------------

GRAN_FONDO_TITLE_EXPR = """(
  lower(rc.title) LIKE '%그란폰도%'
  OR lower(rc.title) LIKE '%gran fondo%'
  OR lower(rc.title) LIKE '%granfondo%'
)"""

RANDONNEURS_TITLE_EXPR = """(
  lower(rc.title) LIKE '%란도너스%'
  OR lower(rc.title) LIKE '%랜도너스%'
  OR lower(rc.title) LIKE '%randonneur%'
  OR lower(rc.title) LIKE '%brevet%'
  OR lower(rc.title) LIKE '%브레베%'
  OR lower(rc.title) LIKE '%브레벳%'
  OR lower(rc.title) LIKE 'sr-%'
  OR lower(rc.title) LIKE '%-sr'
)"""


def fetch_candidates(conn: sqlite3.Connection, category: str) -> list[dict]:
    if category == "gran_fondo":
        title_expr = GRAN_FONDO_TITLE_EXPR
    elif category == "randonneurs":
        title_expr = RANDONNEURS_TITLE_EXPR
    else:
        title_expr = f"({GRAN_FONDO_TITLE_EXPR} OR {RANDONNEURS_TITLE_EXPR})"

    query = f"""
    SELECT
      rc.course_id,
      rc.title,
      rc.gpx_path,
      rc.source_url,
      cg.distance_km,
      cg.elevation_gain_m,
      cg.start_lat,
      cg.start_lng,
      aam.sido_name,
      aam.sigungu_name,
      aam.sido_code,
      aam.sigungu_code,
      CASE WHEN rc.course_id IN (
        SELECT course_id FROM group_member WHERE role = 'canonical'
      ) THEN 'canonical' ELSE 'standalone' END AS selection_type,
      CASE
        WHEN lower(rc.title) LIKE '%그란폰도%' OR lower(rc.title) LIKE '%gran fondo%' OR lower(rc.title) LIKE '%granfondo%'
        THEN 'gran_fondo'
        ELSE 'randonneurs'
      END AS detected_category
    FROM raw_course rc
    JOIN course_geometry cg ON cg.course_id = rc.course_id AND cg.parse_status = 'parsed'
    JOIN admin_area_match aam ON aam.course_id = rc.course_id AND aam.is_korea = 1
    WHERE rc.download_status = 'downloaded'
      AND rc.course_id NOT IN (
        SELECT course_id FROM group_member WHERE role != 'canonical'
      )
      AND {title_expr}
    ORDER BY aam.sido_code, cg.distance_km DESC
    """

    rows = conn.execute(query).fetchall()
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Supabase upload
# ---------------------------------------------------------------------------

def upload_gpx_to_storage(supabase_client, gpx_path: Path, course_id_str: str, retries: int = 3) -> str | None:
    storage_path = f"courses/{course_id_str}.gpx"
    for attempt in range(retries):
        try:
            with open(gpx_path, "rb") as f:
                gpx_bytes = f.read()
            supabase_client.storage.from_("gpx-files").upload(
                storage_path,
                gpx_bytes,
                {"content-type": "application/gpx+xml", "upsert": "true"},
            )
            supabase_url = supabase_client.supabase_url
            return f"{supabase_url}/storage/v1/object/public/gpx-files/{storage_path}"
        except Exception as e:
            msg = str(e)
            if attempt < retries - 1 and ("timeout" in msg.lower() or "522" in msg or "network" in msg.lower()):
                time.sleep(2 ** attempt * 2)
                continue
            print(f"  [WARN] Storage upload failed: {e}", file=sys.stderr)
            return None
    return None


def insert_course(supabase_client, payload: dict, retries: int = 3) -> str | None:
    for attempt in range(retries):
        try:
            result = supabase_client.table("courses").insert(payload).execute()
            if result.data:
                return result.data[0]["id"]
            return None
        except Exception as e:
            msg = str(e)
            if attempt < retries - 1 and ("timeout" in msg.lower() or "522" in msg or "524" in msg or "network" in msg.lower()):
                wait = 2 ** attempt * 2
                print(f"  [RETRY {attempt+1}] waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"  [ERROR] Course insert failed: {e}", file=sys.stderr)
            return None
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import gran fondo / randonneurs courses to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print without inserting")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--category", choices=["gran_fondo", "randonneurs", "all"], default="all")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--skip-gpx-upload", action="store_true", help="Skip GPX storage upload")
    parser.add_argument(
        "--exclude-title", action="append",
        default=["설악그란폰도", "seorak"],  # 박정훈 님 기등록
        help="Exclude courses whose title contains this string (case-insensitive). Can repeat.",
        metavar="KEYWORD",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    env = load_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not service_role_key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local", file=sys.stderr)
        return 1

    if not args.db_path.exists():
        print(f"ERROR: DB not found: {args.db_path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(args.db_path))
    conn.row_factory = sqlite3.Row

    candidates = fetch_candidates(conn, args.category)
    print(f"Found {len(candidates)} candidates (category={args.category})")

    # Exclude by title keywords
    if args.exclude_title:
        exclude_lower = [kw.lower() for kw in args.exclude_title]
        before = len(candidates)
        candidates = [r for r in candidates if not any(kw in r["title"].lower() for kw in exclude_lower)]
        print(f"  → Excluded {before - len(candidates)} courses matching: {args.exclude_title}")

    if args.limit:
        candidates = candidates[: args.limit]
        print(f"  → Limited to {len(candidates)}")

    if args.dry_run:
        print("\n--- DRY RUN: first 5 candidates ---")
        for row in candidates[:5]:
            print(f"  [{row['detected_category']}] {row['selection_type']:10s} | {row['title'][:60]:60s} | {row['distance_km']:.1f}km | {row['elevation_gain_m']:.0f}m | {row['sigungu_name']}")
        print(f"\nTotal: {len(candidates)} courses would be imported")
        return 0

    # Connect to Supabase
    from supabase import create_client
    sb = create_client(supabase_url, service_role_key)

    ok = 0
    skip = 0
    errors = 0

    for i, row in enumerate(candidates):
        course_id = row["course_id"]
        title = row["title"]
        gpx_path = Path(row["gpx_path"])
        category = row["detected_category"]

        print(f"[{i+1}/{len(candidates)}] {title[:50]:50s} ", end="", flush=True)

        if not gpx_path.exists():
            print(f"SKIP (gpx not found: {gpx_path})")
            skip += 1
            continue

        # Parse GPX
        parsed = parse_gpx(gpx_path)
        if parsed is None:
            print("SKIP (parse failed)")
            skip += 1
            continue

        dist = parsed["distance_km"]
        elev = parsed["elevation_gain_m"]
        difficulty = infer_difficulty(dist, elev)
        theme = build_theme(category, row["sigungu_name"], row["sido_name"])
        tags = build_tags(category, row["sido_name"], row["sigungu_name"])
        description = build_description(
            row["source_url"] or "",
            row["sido_name"],
            row["sigungu_name"],
            course_id,
        )

        # Upload GPX
        gpx_url = None
        if not args.skip_gpx_upload:
            # Use a temp UUID-like key based on course_id for storage
            import hashlib
            storage_key = hashlib.md5(f"ridingazua-{course_id}".encode()).hexdigest()
            gpx_url = upload_gpx_to_storage(sb, gpx_path, storage_key)

        payload = {
            "title": title,
            "description": description,
            "difficulty": difficulty,
            "distance_km": dist,
            "elevation_gain_m": int(elev),
            "est_duration_min": estimate_duration_min(dist, difficulty),
            "gpx_url": gpx_url,
            "theme": theme,
            "tags": tags,
            "created_by": None,
            "uploader_name": "Ridingazua import",
            "uploader_emoji": "🗺️",
            "route_geojson": parsed["geojson"],
            "route_preview_points": parsed["preview_points"],
            "route_render_metadata": parsed["render_metadata"],
            "source_url": row["source_url"],
            "surface_type": "road",
            "metadata_history": [
                {
                    "type": "create",
                    "actorUserId": "system:ridingazua-import",
                    "actorDisplayName": "Ridingazua import",
                    "timestamp": now_iso(),
                    "values": {
                        "title": title,
                        "difficulty": difficulty,
                        "theme": theme,
                        "tags": tags,
                    },
                }
            ],
        }

        new_id = insert_course(sb, payload)
        if new_id:
            print(f"OK  [{difficulty:8s}] {dist:.1f}km {elev:.0f}m → {new_id}")
            ok += 1
        else:
            print("ERROR")
            errors += 1

        # Rate limit: pause between every insert to avoid overwhelming PostgREST
        time.sleep(0.3)
        # Longer pause every batch
        if (i + 1) % BATCH_SIZE == 0:
            time.sleep(1.0)

    conn.close()

    print(f"\n{'='*60}")
    print(f"Done: {ok} imported, {skip} skipped, {errors} errors")
    print(f"Total candidates: {len(candidates)}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
