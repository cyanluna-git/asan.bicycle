#!/usr/bin/env python3
"""
Fetch famous climbing segments from the Strava Segments API and upsert them
into the famous_uphills table in Supabase.

This script uses only the Python standard library (no `requests`, no `polyline`).

Usage:
  # Self-test only (no API/DB calls):
  python3 scripts/strava-fetch-uphills.py --dry-run

  # Hit the Strava API but skip the DB upsert:
  python3 scripts/strava-fetch-uphills.py \
      --access-token STRAVA_TOKEN \
      --dry-run

  # Full run (Strava API + Supabase upsert):
  python3 scripts/strava-fetch-uphills.py \
      --access-token STRAVA_TOKEN \
      --supabase-url https://xxx.supabase.co \
      --service-role-key SUPABASE_SERVICE_ROLE_KEY

Get a Strava access token: https://www.strava.com/settings/api
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

STRAVA_BASE = "https://www.strava.com/api/v3"

# 13 climbing-rich bounding boxes covering Korea's major mountain regions.
# Each bbox is the maximum extent the Strava /segments/explore endpoint accepts
# (≈ 0.4° lat × 0.5° lng) so a single explore call returns up to 10 segments.
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
]


# ---------------------------------------------------------------------------
# Polyline decoding (Google encoded polyline algorithm)
# ---------------------------------------------------------------------------

def decode_polyline(encoded: str) -> list[tuple[float, float]]:
    """Decode a Google encoded polyline string to a list of (lat, lng) tuples.

    Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    """
    coords: list[tuple[float, float]] = []
    if not encoded:
        return coords

    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        # Decode latitude delta
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

        # Decode longitude delta
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
    """Convert a list of (lat, lng) tuples to an EWKT LINESTRING (lng lat order)."""
    points = ",".join(f"{lng} {lat}" for lat, lng in coords)
    return f"SRID=4326;LINESTRING({points})"


def to_wkt_point(coord: tuple[float, float]) -> str:
    """Convert a single (lat, lng) tuple to an EWKT POINT (lng lat order)."""
    lat, lng = coord
    return f"SRID=4326;POINT({lng} {lat})"


# ---------------------------------------------------------------------------
# Strava API client (urllib + manual rate-limit handling)
# ---------------------------------------------------------------------------

class RateLimitedError(Exception):
    """Raised when Strava returns 429 Too Many Requests."""


def strava_request(
    path: str,
    access_token: str,
    params: dict | None = None,
    sleep_between: float = 5.0,
) -> dict | list:
    """Perform an authenticated GET against the Strava API with rate-limit awareness.

    Parses `X-RateLimit-Usage` / `X-RateLimit-Limit` headers and sleeps when
    the short-window usage approaches the limit. On HTTP 429 it sleeps for
    `Retry-After + 60` seconds and retries once.
    """
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
                # Honour rate limits before next call.
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
    """Sleep if short-window usage is close to the short-window limit."""
    try:
        short_usage = int(usage_header.split(",")[0])
        short_limit = int(limit_header.split(",")[0])
    except (ValueError, IndexError):
        return

    if short_usage >= max(short_limit - 20, 1):
        print(f"  rate-limit guard: usage={short_usage}/{short_limit} — sleeping 60s")
        time.sleep(60)


def explore_bbox(bbox: dict, access_token: str, sleep_between: float) -> list[dict]:
    """Call /segments/explore for a single bbox. Returns the `segments` list."""
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
    """Call /segments/{id} and return the full segment detail."""
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
    """POST a single row to famous_uphills with upsert semantics."""
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
    """Convert a Strava segment detail payload to a famous_uphills row.

    Returns None if the polyline cannot be decoded into >= 2 coordinates.
    """
    polyline_str = (detail.get("map") or {}).get("polyline", "")
    coords = decode_polyline(polyline_str)
    if len(coords) < 2:
        return None

    start_latlng = detail.get("start_latlng") or coords[0]
    end_latlng = detail.get("end_latlng") or coords[-1]

    return {
        "strava_segment_id": detail.get("id"),
        "name": detail.get("name"),
        "distance_m": detail.get("distance"),
        "avg_grade": detail.get("average_grade"),
        "max_grade": detail.get("maximum_grade"),
        "elevation_gain_m": detail.get("total_elevation_gain"),
        "climb_category": detail.get("climb_category"),
        "start_latlng": to_wkt_point(tuple(start_latlng)),
        "end_latlng": to_wkt_point(tuple(end_latlng)),
        "route": to_wkt_linestring(coords),
        "raw_strava": detail,
    }


# ---------------------------------------------------------------------------
# CLI / orchestration
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Strava climbing segments for Korea and upsert them into famous_uphills.",
    )
    parser.add_argument(
        "--access-token",
        default="",
        help="Strava API access token (required for live API calls; omit for self-test only)",
    )
    parser.add_argument(
        "--supabase-url",
        default="",
        help="Supabase project URL (e.g. https://xxx.supabase.co)",
    )
    parser.add_argument(
        "--service-role-key",
        default="",
        help="Supabase service role key (required for DB upsert)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip the Supabase upsert step (still calls Strava if --access-token is set)",
    )
    parser.add_argument(
        "--min-distance",
        type=float,
        default=500.0,
        help="Minimum segment distance in meters (default: 500)",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=5.0,
        help="Seconds to sleep between Strava API calls (default: 5.0)",
    )
    return parser.parse_args()


def self_test() -> bool:
    """Decode a known polyline and verify the WKT output is in Korea's range."""
    # 4 sample points around 한라산 영실 (33.36N, 126.49E).
    sample_coords = [
        (33.36000, 126.49000),
        (33.36500, 126.49500),
        (33.37000, 126.50000),
        (33.37500, 126.50500),
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

    wkt = to_wkt_linestring(decoded)
    point_wkt = to_wkt_point(decoded[0])

    # Korea range: lng 124-132, lat 33-39
    for lat, lng in decoded:
        if not (33.0 <= lat <= 39.0):
            print(f"  self-test FAIL: lat {lat} outside Korea range")
            return False
        if not (124.0 <= lng <= 132.0):
            print(f"  self-test FAIL: lng {lng} outside Korea range")
            return False

    print(f"  decoded {len(decoded)} points")
    print(f"  WKT linestring: {wkt}")
    print(f"  WKT point:      {point_wkt}")
    print("polyline self-test: OK")
    return True


def _encode_polyline(coords: list[tuple[float, float]]) -> str:
    """Encode a list of (lat, lng) tuples to a Google encoded polyline string.

    Used only for the self-test — the script never calls this against the API.
    """
    def encode_value(v: int) -> str:
        v = ~(v << 1) if v < 0 else (v << 1)
        out = []
        while v >= 0x20:
            out.append(chr((0x20 | (v & 0x1f)) + 63))
            v >>= 5
        out.append(chr(v + 63))
        return "".join(out)

    result = []
    prev_lat = 0
    prev_lng = 0
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

    print("=== Strava Famous Uphills Fetcher ===\n")

    # Self-test path: no token at all → run polyline self-test and exit.
    if not args.access_token:
        print("No --access-token provided. Running self-test only.\n")
        ok = self_test()
        sys.exit(0 if ok else 1)

    # Live mode: validate Supabase args unless dry-run.
    if not args.dry_run:
        if not args.supabase_url or not args.service_role_key:
            print("ERROR: --supabase-url and --service-role-key are required unless --dry-run is set.")
            sys.exit(1)

    print(f"Mode:            {'DRY-RUN (no DB upsert)' if args.dry_run else 'LIVE'}")
    print(f"Bboxes:          {len(KOREA_BBOXES)}")
    print(f"Min distance:    {args.min_distance} m")
    print(f"Inter-call sleep: {args.sleep} s")
    print()

    seen_ids: set[int] = set()
    explored = 0
    fetched = 0
    upserted = 0
    skipped = 0
    errors = 0

    for idx, bbox in enumerate(KOREA_BBOXES, start=1):
        print(f"=== [{idx}/{len(KOREA_BBOXES)}] {bbox['region']} ===")
        explored += 1

        try:
            segments = explore_bbox(bbox, args.access_token, args.sleep)
        except Exception as e:
            print(f"  explore error: {e}")
            errors += 1
            continue

        collected = 0
        filtered = 0

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
                print(
                    f"  [DRY] would upsert: name={row['name']!r}, "
                    f"dist={row['distance_m']}, gain={row['elevation_gain_m']}, "
                    f"n_points={len(decode_polyline((row.get('raw_strava') or {}).get('map', {}).get('polyline', '')))}"
                )
                upserted += 1
            else:
                status = upsert_segment(args.supabase_url, args.service_role_key, row)
                if status in (200, 201, 204):
                    print(
                        f"  OK  {seg_id}  {row['name']!r}  "
                        f"dist={row['distance_m']}m  gain={row['elevation_gain_m']}m"
                    )
                    upserted += 1
                else:
                    print(f"  FAIL upsert {seg_id} HTTP {status}")
                    errors += 1
            collected += 1

        print(f"  collected: {collected} segments ({filtered} filtered out by distance)")

    print()
    print(
        f"Done: explored={explored} regions, fetched={fetched} details, "
        f"upserted={upserted}, skipped={skipped}, errors={errors}"
    )


if __name__ == "__main__":
    main()
