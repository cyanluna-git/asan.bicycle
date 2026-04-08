#!/usr/bin/env python3
"""
Fetch famous climbing segments from the Strava Segments API and upsert them
into the famous_uphills table in Supabase.

This script uses only the Python standard library (no `requests`, no `polyline`).

Two-phase workflow (recommended):
  # Phase 1 — explore all bboxes, save filtered candidates to a JSON file
  python3 scripts/strava-fetch-uphills.py \\
      --access-token STRAVA_TOKEN \\
      --explore-only \\
      --min-climb-category 1 \\
      --candidates-file uphills_candidates.json

  # Review uphills_candidates.json, then:

  # Phase 2 — fetch segment details for candidates and upsert to DB
  python3 scripts/strava-fetch-uphills.py \\
      --access-token STRAVA_TOKEN \\
      --from-candidates uphills_candidates.json \\
      --supabase-url https://xxx.supabase.co \\
      --service-role-key SUPABASE_SERVICE_ROLE_KEY

Legacy one-shot workflow (no filtering):
  python3 scripts/strava-fetch-uphills.py \\
      --access-token STRAVA_TOKEN \\
      --supabase-url https://xxx.supabase.co \\
      --service-role-key SUPABASE_SERVICE_ROLE_KEY

Get a Strava access token: https://www.strava.com/settings/api

climb_category reference (Strava):
  0 = NC (no category / uncategorized)
  1 = Cat4  2 = Cat3  3 = Cat2  4 = Cat1  5 = HC
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STRAVA_BASE = "https://www.strava.com/api/v3"

# Climbing-rich bounding boxes covering Korea's major mountain regions.
# Each bbox is ≈ 0.4° lat × 0.5° lng — the max size for /segments/explore.
KOREA_BBOXES: list[dict] = [
    {"region": "강원 설악산권",        "sw_lat": 38.00, "sw_lng": 128.30, "ne_lat": 38.40, "ne_lng": 128.80},
    {"region": "강원 오대산/평창",      "sw_lat": 37.60, "sw_lng": 128.40, "ne_lat": 37.90, "ne_lng": 128.80},
    {"region": "강원 태백/정선",        "sw_lat": 37.10, "sw_lng": 128.60, "ne_lat": 37.50, "ne_lng": 129.10},
    {"region": "충북/경북 소백산",      "sw_lat": 36.70, "sw_lng": 128.30, "ne_lat": 37.00, "ne_lng": 128.80},
    {"region": "충북 속리산권",         "sw_lat": 36.40, "sw_lng": 127.70, "ne_lat": 36.80, "ne_lng": 128.20},
    {"region": "경북 문경/단양",        "sw_lat": 36.80, "sw_lng": 128.00, "ne_lat": 37.10, "ne_lng": 128.50},
    {"region": "전북/경남 덕유산권",    "sw_lat": 35.70, "sw_lng": 127.60, "ne_lat": 36.10, "ne_lng": 127.90},
    {"region": "전남 지리산 동부",      "sw_lat": 35.20, "sw_lng": 127.40, "ne_lat": 35.60, "ne_lng": 127.80},
    {"region": "전남 화순/해남",        "sw_lat": 34.50, "sw_lng": 126.60, "ne_lat": 35.00, "ne_lng": 127.20},
    {"region": "제주 한라산 동",        "sw_lat": 33.30, "sw_lng": 126.60, "ne_lat": 33.55, "ne_lng": 126.90},
    {"region": "제주 한라산 서",        "sw_lat": 33.30, "sw_lng": 126.20, "ne_lat": 33.55, "ne_lng": 126.60},
    {"region": "제주 한라산 남",        "sw_lat": 33.20, "sw_lng": 126.30, "ne_lat": 33.45, "ne_lng": 126.70},
    {"region": "제주 한라산 북",        "sw_lat": 33.40, "sw_lng": 126.40, "ne_lat": 33.60, "ne_lng": 126.80},
    {"region": "충남 계룡산/공주",      "sw_lat": 36.28, "sw_lng": 127.15, "ne_lat": 36.50, "ne_lng": 127.45},
    {"region": "충남 칠갑산/청양",      "sw_lat": 36.30, "sw_lng": 126.70, "ne_lat": 36.55, "ne_lng": 126.95},
    {"region": "충남 오서산/보령",      "sw_lat": 36.38, "sw_lng": 126.50, "ne_lat": 36.62, "ne_lng": 126.78},
    {"region": "충남 덕숭산/예산",      "sw_lat": 36.60, "sw_lng": 126.60, "ne_lat": 36.82, "ne_lng": 126.90},
    {"region": "충남 아산/천안",        "sw_lat": 36.72, "sw_lng": 126.90, "ne_lat": 36.95, "ne_lng": 127.20},
    {"region": "충남 금산/논산",        "sw_lat": 36.05, "sw_lng": 127.35, "ne_lat": 36.30, "ne_lng": 127.65},
    # --- 경기 ---
    {"region": "경기 가평/포천",         "sw_lat": 37.75, "sw_lng": 127.30, "ne_lat": 38.05, "ne_lng": 127.70},  # 화악산, 명지산, 운악산
    {"region": "경기 양평",              "sw_lat": 37.45, "sw_lng": 127.30, "ne_lat": 37.75, "ne_lng": 127.65},  # 용문산, 유명산
    # --- 강원 서부/동부 추가 ---
    {"region": "강원 홍천/인제",         "sw_lat": 37.65, "sw_lng": 128.00, "ne_lat": 37.95, "ne_lng": 128.45},  # 방태산, 개인산
    {"region": "강원 원주/치악산",       "sw_lat": 37.20, "sw_lng": 127.80, "ne_lat": 37.55, "ne_lng": 128.20},  # 치악산
    {"region": "강원 강릉/동해",         "sw_lat": 37.30, "sw_lng": 129.00, "ne_lat": 37.65, "ne_lng": 129.40},  # 두타산, 청옥산
    # --- 충북 추가 ---
    {"region": "충북 월악산/제천",       "sw_lat": 36.75, "sw_lng": 127.85, "ne_lat": 37.05, "ne_lng": 128.25},  # 월악산, 금수산
    # --- 전북 ---
    {"region": "전북 완주/진안",         "sw_lat": 35.60, "sw_lng": 127.15, "ne_lat": 35.95, "ne_lng": 127.55},  # 운장산, 마이산
    {"region": "전북 내장산/정읍",       "sw_lat": 35.30, "sw_lng": 126.70, "ne_lat": 35.65, "ne_lng": 127.05},  # 내장산, 입암산
    # --- 전남 추가 ---
    {"region": "전남 무등산/광주",       "sw_lat": 34.95, "sw_lng": 126.85, "ne_lat": 35.25, "ne_lng": 127.15},  # 무등산
    # --- 경북 ---
    {"region": "경북 팔공산/대구",       "sw_lat": 35.80, "sw_lng": 128.50, "ne_lat": 36.10, "ne_lng": 128.90},  # 팔공산
    {"region": "경북 주왕산/청송",       "sw_lat": 36.20, "sw_lng": 128.95, "ne_lat": 36.55, "ne_lng": 129.40},  # 주왕산, 명동산
    {"region": "경북 울진/봉화",         "sw_lat": 36.70, "sw_lng": 128.90, "ne_lat": 37.05, "ne_lng": 129.30},  # 일월산, 통고산
    # --- 경남 ---
    {"region": "경남 가야산/합천",       "sw_lat": 35.45, "sw_lng": 127.90, "ne_lat": 35.90, "ne_lng": 128.30},  # 가야산, 황매산
    {"region": "경남 영남알프스",        "sw_lat": 35.40, "sw_lng": 128.80, "ne_lat": 35.70, "ne_lng": 129.20},  # 재약산, 신불산, 간월산
    {"region": "경남 지리산 남부/하동",  "sw_lat": 35.00, "sw_lng": 127.55, "ne_lat": 35.25, "ne_lng": 127.90},  # 하동, 쌍계사 능선
]


# ---------------------------------------------------------------------------
# Polyline decoding (Google encoded polyline algorithm)
# ---------------------------------------------------------------------------

def decode_polyline(encoded: str) -> list[tuple[float, float]]:
    """Decode a Google encoded polyline string to a list of (lat, lng) tuples."""
    coords: list[tuple[float, float]] = []
    if not encoded:
        return coords

    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        result = 0
        shift = 0
        while True:
            if index >= length:
                return coords
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        result = 0
        shift = 0
        while True:
            if index >= length:
                return coords
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coords.append((lat / 1e5, lng / 1e5))

    return coords


# ---------------------------------------------------------------------------
# WKT helpers (PostGIS EWKT format, lng FIRST then lat)
# ---------------------------------------------------------------------------

def to_wkt_linestring(coords: list[tuple[float, float]]) -> str:
    points = ",".join(f"{lng} {lat}" for lat, lng in coords)
    return f"SRID=4326;LINESTRING({points})"


def to_wkt_point(coord: tuple[float, float]) -> str:
    lat, lng = coord
    return f"SRID=4326;POINT({lng} {lat})"


# ---------------------------------------------------------------------------
# Strava API client
# ---------------------------------------------------------------------------

class RateLimitedError(Exception):
    pass


def strava_request(
    path: str,
    access_token: str,
    params: dict | None = None,
    sleep_between: float = 5.0,
) -> dict | list:
    url = f"{STRAVA_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                usage_header = resp.headers.get("X-RateLimit-Usage", "")
                limit_header = resp.headers.get("X-RateLimit-Limit", "200,2000")
                _maybe_throttle(usage_header, limit_header)
                body = resp.read().decode("utf-8")
                if sleep_between > 0:
                    time.sleep(sleep_between)
                return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", "60"))
                wait = retry_after + 60
                print(f"  HTTP 429 — rate limited. Sleeping {wait}s before retry...")
                time.sleep(wait)
                if attempt == 0:
                    continue
                raise RateLimitedError("rate-limited twice in a row") from e
            body = e.read().decode("utf-8", errors="replace")
            print(f"  HTTP {e.code}: {body[:200]}")
            raise
    raise RuntimeError("unreachable")


def _maybe_throttle(usage_header: str, limit_header: str) -> None:
    try:
        short_usage = int(usage_header.split(",")[0])
        short_limit = int(limit_header.split(",")[0])
    except (ValueError, IndexError):
        return
    if short_usage >= max(short_limit - 20, 1):
        print(f"  rate-limit guard: usage={short_usage}/{short_limit} — sleeping 60s")
        time.sleep(60)


def explore_bbox(bbox: dict, access_token: str, sleep_between: float) -> list[dict]:
    bounds = f"{bbox['sw_lat']},{bbox['sw_lng']},{bbox['ne_lat']},{bbox['ne_lng']}"
    data = strava_request(
        "/segments/explore",
        access_token,
        params={"bounds": bounds, "activity_type": "riding"},
        sleep_between=sleep_between,
    )
    if isinstance(data, dict):
        return data.get("segments", [])
    return []


def fetch_segment(segment_id: int, access_token: str, sleep_between: float) -> dict:
    data = strava_request(
        f"/segments/{segment_id}",
        access_token,
        sleep_between=sleep_between,
    )
    if not isinstance(data, dict):
        raise ValueError(f"unexpected response type for segment {segment_id}")
    return data


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def upsert_segment(supabase_url: str, service_role_key: str, row: dict) -> int:
    url = f"{supabase_url}/rest/v1/famous_uphills?on_conflict=strava_segment_id"
    payload = json.dumps(row).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  upsert HTTP {e.code}: {body[:200]}")
        return e.code


# ---------------------------------------------------------------------------
# Row builder
# ---------------------------------------------------------------------------

def build_row(detail: dict, _region_label: str) -> dict | None:
    polyline_str = (detail.get("map") or {}).get("polyline", "")
    coords = decode_polyline(polyline_str)
    if len(coords) < 2:
        return None

    start_latlng = detail.get("start_latlng") or coords[0]
    end_latlng = detail.get("end_latlng") or coords[-1]

    avg_grade = detail.get("average_grade")
    max_grade = detail.get("maximum_grade")

    # Clamp grades to NUMERIC(4,2) range [-99.99, 99.99]
    if avg_grade is not None:
        avg_grade = max(-99.99, min(99.99, float(avg_grade)))
    if max_grade is not None:
        max_grade = max(-99.99, min(99.99, float(max_grade)))

    return {
        "strava_segment_id": detail.get("id"),
        "name": detail.get("name"),
        "distance_m": detail.get("distance"),
        "avg_grade": avg_grade,
        "max_grade": max_grade,
        "elevation_gain_m": detail.get("total_elevation_gain"),
        "climb_category": detail.get("climb_category"),
        "start_latlng": to_wkt_point(tuple(start_latlng)),
        "end_latlng": to_wkt_point(tuple(end_latlng)),
        "route": to_wkt_linestring(coords),
        "raw_strava": detail,
    }


# ---------------------------------------------------------------------------
# Phase 1: Explore — collect candidates
# ---------------------------------------------------------------------------

CLIMB_CATEGORY_LABEL = {0: "NC", 1: "Cat4", 2: "Cat3", 3: "Cat2", 4: "Cat1", 5: "HC"}


def run_explore(args: argparse.Namespace) -> None:
    """Phase 1: explore all bboxes, filter, save candidates JSON."""
    print("=== Phase 1: Explore — collecting candidates ===\n")
    print(f"Bboxes:             {len(KOREA_BBOXES)}")
    print(f"Min distance:       {args.min_distance} m")
    print(f"Min avg_grade:      {args.min_grade}%")
    print(f"Min climb_category: {args.min_climb_category} "
          f"({CLIMB_CATEGORY_LABEL.get(args.min_climb_category, '?')})")
    print(f"Output file:        {args.candidates_file}")
    append_mode = getattr(args, "append", False)
    print(f"Mode:               {'APPEND (preserving existing)' if append_mode else 'OVERWRITE'}")
    print()

    # In append mode, load existing candidates and pre-seed seen_ids
    if append_mode and os.path.exists(args.candidates_file):
        with open(args.candidates_file, encoding="utf-8") as f:
            candidates: list[dict] = json.load(f)
        seen_ids: set[int] = {c["strava_segment_id"] for c in candidates}
        print(f"Loaded {len(candidates)} existing candidates from {args.candidates_file}\n")
    else:
        candidates = []
        seen_ids = set()

    total_raw = 0
    total_filtered = 0

    for idx, bbox in enumerate(KOREA_BBOXES, start=1):
        print(f"[{idx}/{len(KOREA_BBOXES)}] {bbox['region']}")
        try:
            segments = explore_bbox(bbox, args.access_token, args.sleep)
        except Exception as e:
            print(f"  explore error: {e}")
            continue

        region_candidates = 0
        region_filtered = 0

        for seg in segments:
            seg_id = seg.get("id")
            if not seg_id or seg_id in seen_ids:
                continue
            seen_ids.add(seg_id)
            total_raw += 1

            distance = float(seg.get("distance") or 0)
            avg_grade = float(seg.get("avg_grade") or 0)
            climb_category = int(seg.get("climb_category") or 0)
            name = seg.get("name", "")

            # Apply filters
            if distance < args.min_distance:
                region_filtered += 1
                total_filtered += 1
                continue
            if avg_grade < args.min_grade and climb_category < args.min_climb_category:
                region_filtered += 1
                total_filtered += 1
                print(f"  skip [{CLIMB_CATEGORY_LABEL.get(climb_category,'?'):4s}] "
                      f"{avg_grade:5.1f}%  {name!r}")
                continue

            cat_label = CLIMB_CATEGORY_LABEL.get(climb_category, "?")
            print(f"  keep [{cat_label:4s}] {avg_grade:5.1f}%  dist={distance:.0f}m  {name!r}")
            candidates.append({
                "strava_segment_id": seg_id,
                "name": name,
                "avg_grade": avg_grade,
                "climb_category": climb_category,
                "climb_category_label": cat_label,
                "distance_m": distance,
                "region": bbox["region"],
                "fetched": False,
            })
            region_candidates += 1

        print(f"  → kept {region_candidates}, filtered {region_filtered}\n")

    # Save candidates to file
    with open(args.candidates_file, "w", encoding="utf-8") as f:
        json.dump(candidates, f, ensure_ascii=False, indent=2)

    print(f"Done: {total_raw} segments explored, "
          f"{total_filtered} filtered out, "
          f"{len(candidates)} candidates saved → {args.candidates_file}")
    print()
    _print_category_summary(candidates)


def _print_category_summary(candidates: list[dict]) -> None:
    from collections import Counter
    counts = Counter(c["climb_category_label"] for c in candidates)
    print("Category breakdown:")
    for label in ["HC", "Cat1", "Cat2", "Cat3", "Cat4", "NC"]:
        n = counts.get(label, 0)
        if n:
            print(f"  {label:4s}: {n}")


# ---------------------------------------------------------------------------
# Phase 2: Fetch details + upsert
# ---------------------------------------------------------------------------

def run_fetch(args: argparse.Namespace) -> None:
    """Phase 2: read candidates file, fetch details, upsert to DB."""
    with open(args.from_candidates, encoding="utf-8") as f:
        candidates: list[dict] = json.load(f)

    pending = [c for c in candidates if not c.get("fetched")]
    done_before = len(candidates) - len(pending)

    print("=== Phase 2: Fetch details + upsert ===\n")
    print(f"Candidates file:  {args.from_candidates}")
    print(f"Total candidates: {len(candidates)}")
    print(f"Already fetched:  {done_before}")
    print(f"Remaining:        {len(pending)}")
    print(f"Mode:             {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print()

    fetched = 0
    upserted = 0
    errors = 0

    for i, cand in enumerate(pending, start=1):
        seg_id = cand["strava_segment_id"]
        name = cand["name"]
        cat = cand["climb_category_label"]
        grade = cand["avg_grade"]
        region = cand["region"]

        print(f"[{i}/{len(pending)}] {seg_id}  [{cat}] {grade:.1f}%  {name!r}  ({region})")

        try:
            detail = fetch_segment(seg_id, args.access_token, args.sleep)
            fetched += 1
        except RateLimitedError as e:
            print(f"  RATE-LIMITED — stopping. Re-run with --from-candidates to resume.")
            # Save progress before exiting
            _save_candidates(args.from_candidates, candidates)
            print(f"  Progress saved: {upserted} upserted so far.")
            sys.exit(1)
        except Exception as e:
            print(f"  fetch error: {e}")
            errors += 1
            continue

        row = build_row(detail, region)
        if row is None:
            print(f"  skip — no decodable polyline")
            errors += 1
            continue

        if args.dry_run:
            print(f"  [DRY] would upsert: gain={row['elevation_gain_m']}m")
            upserted += 1
        else:
            status = upsert_segment(args.supabase_url, args.service_role_key, row)
            if status in (200, 201, 204):
                print(f"  OK  gain={row['elevation_gain_m']}m  max_grade={row['max_grade']}%")
                upserted += 1
            else:
                print(f"  FAIL upsert HTTP {status}")
                errors += 1
                continue

        # Mark as fetched and save progress incrementally
        cand["fetched"] = True
        _save_candidates(args.from_candidates, candidates)

    print()
    print(f"Done: fetched={fetched}, upserted={upserted}, errors={errors}")
    remaining = sum(1 for c in candidates if not c.get("fetched"))
    if remaining:
        print(f"Remaining unfetched: {remaining} — re-run with --from-candidates to continue.")


def _save_candidates(path: str, candidates: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(candidates, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Legacy one-shot mode (backwards compatible)
# ---------------------------------------------------------------------------

def run_oneshot(args: argparse.Namespace) -> None:
    print("=== Strava Famous Uphills Fetcher (one-shot mode) ===\n")
    print(f"Mode:            {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"Bboxes:          {len(KOREA_BBOXES)}")
    print(f"Min distance:    {args.min_distance} m")
    print(f"Inter-call sleep: {args.sleep} s")
    print()

    seen_ids: set[int] = set()
    explored = fetched = upserted = skipped = errors = 0

    for idx, bbox in enumerate(KOREA_BBOXES, start=1):
        print(f"=== [{idx}/{len(KOREA_BBOXES)}] {bbox['region']} ===")
        explored += 1

        try:
            segments = explore_bbox(bbox, args.access_token, args.sleep)
        except Exception as e:
            print(f"  explore error: {e}")
            errors += 1
            continue

        collected = filtered = 0

        for seg in segments:
            seg_id = seg.get("id")
            if not seg_id or seg_id in seen_ids:
                continue

            distance = seg.get("distance") or 0
            if distance < args.min_distance:
                filtered += 1
                seen_ids.add(seg_id)
                continue

            seen_ids.add(seg_id)

            try:
                detail = fetch_segment(seg_id, args.access_token, args.sleep)
                fetched += 1
            except Exception as e:
                print(f"  fetch error for segment {seg_id}: {e}")
                errors += 1
                continue

            row = build_row(detail, bbox["region"])
            if row is None:
                print(f"  skip {seg_id} ({detail.get('name')!r}) — no decodable polyline")
                skipped += 1
                continue

            if args.dry_run:
                print(f"  [DRY] {row['name']!r}  dist={row['distance_m']}m")
                upserted += 1
            else:
                status = upsert_segment(args.supabase_url, args.service_role_key, row)
                if status in (200, 201, 204):
                    print(f"  OK  {seg_id}  {row['name']!r}  "
                          f"dist={row['distance_m']}m  gain={row['elevation_gain_m']}m")
                    upserted += 1
                else:
                    print(f"  FAIL upsert {seg_id} HTTP {status}")
                    errors += 1
            collected += 1

        print(f"  collected: {collected} segments ({filtered} filtered out by distance)")

    print()
    print(f"Done: explored={explored}, fetched={fetched}, "
          f"upserted={upserted}, skipped={skipped}, errors={errors}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Strava climbing segments and upsert into famous_uphills.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--access-token", default="",
                        help="Strava API access token")
    parser.add_argument("--supabase-url", default="",
                        help="Supabase project URL")
    parser.add_argument("--service-role-key", default="",
                        help="Supabase service role key")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip DB upsert")

    # Phase 1 options
    parser.add_argument("--explore-only", action="store_true",
                        help="Phase 1: explore bboxes and save candidates, skip fetching details")
    parser.add_argument("--append", action="store_true",
                        help="When --explore-only: append new candidates to existing file (preserves fetched=true entries)")
    parser.add_argument("--candidates-file", default="uphills_candidates.json",
                        help="Output file for --explore-only (default: uphills_candidates.json)")
    parser.add_argument("--min-climb-category", type=int, default=0,
                        help="Min climb_category to include (0=any, 1=Cat4+, 2=Cat3+, 3=Cat2+, 4=Cat1+, 5=HC only)")
    parser.add_argument("--min-grade", type=float, default=0.0,
                        help="Min avg_grade%% to include even if climb_category is below threshold")

    # Phase 2 options
    parser.add_argument("--from-candidates", default="",
                        help="Phase 2: read candidates from this JSON file and fetch/upsert")

    # Common
    parser.add_argument("--min-distance", type=float, default=500.0,
                        help="Minimum segment distance in meters (default: 500)")
    parser.add_argument("--sleep", type=float, default=5.0,
                        help="Seconds between Strava API calls (default: 5.0)")
    return parser.parse_args()


def self_test() -> bool:
    sample_coords = [
        (33.36000, 126.49000), (33.36500, 126.49500),
        (33.37000, 126.50000), (33.37500, 126.50500),
    ]
    encoded = _encode_polyline(sample_coords)
    decoded = decode_polyline(encoded)

    if len(decoded) != len(sample_coords):
        print(f"  self-test FAIL: decoded {len(decoded)} points, expected {len(sample_coords)}")
        return False

    for (orig_lat, orig_lng), (dec_lat, dec_lng) in zip(sample_coords, decoded):
        if abs(orig_lat - dec_lat) > 1e-4 or abs(orig_lng - dec_lng) > 1e-4:
            print(f"  self-test FAIL: ({orig_lat},{orig_lng}) != ({dec_lat},{dec_lng})")
            return False

    print(f"  decoded {len(decoded)} points")
    print(f"  WKT linestring: {to_wkt_linestring(decoded)}")
    print(f"  WKT point:      {to_wkt_point(decoded[0])}")
    print("polyline self-test: OK")
    return True


def _encode_polyline(coords: list[tuple[float, float]]) -> str:
    def encode_value(v: int) -> str:
        v = ~(v << 1) if v < 0 else (v << 1)
        out = []
        while v >= 0x20:
            out.append(chr((0x20 | (v & 0x1f)) + 63))
            v >>= 5
        out.append(chr(v + 63))
        return "".join(out)

    result = []
    prev_lat = prev_lng = 0
    for lat, lng in coords:
        lat_i = int(round(lat * 1e5))
        lng_i = int(round(lng * 1e5))
        result.append(encode_value(lat_i - prev_lat))
        result.append(encode_value(lng_i - prev_lng))
        prev_lat = lat_i
        prev_lng = lng_i
    return "".join(result)


def main() -> None:
    args = parse_args()

    if not args.access_token:
        print("No --access-token provided. Running self-test only.\n")
        ok = self_test()
        sys.exit(0 if ok else 1)

    if args.explore_only:
        run_explore(args)
    elif args.from_candidates:
        if not args.dry_run and (not args.supabase_url or not args.service_role_key):
            print("ERROR: --supabase-url and --service-role-key required for phase 2.")
            sys.exit(1)
        run_fetch(args)
    else:
        # Legacy one-shot
        if not args.dry_run and (not args.supabase_url or not args.service_role_key):
            print("ERROR: --supabase-url and --service-role-key required.")
            sys.exit(1)
        run_oneshot(args)


if __name__ == "__main__":
    main()
