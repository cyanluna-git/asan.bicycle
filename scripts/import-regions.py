#!/usr/bin/env python3
"""
Import Korean administrative boundary data (sido + sigungu) into the regions table.

Source files (WGS84 / EPSG:4326):
  - data/korea-admin-boundaries/skorea_provinces_geo.json      (17 sido)
  - data/korea-admin-boundaries/skorea_municipalities_geo.json  (251 sigungu)

Usage:
  SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/import-regions.py
  python3 scripts/import-regions.py <SERVICE_ROLE_KEY>
  python3 scripts/import-regions.py --dry-run
  python3 scripts/import-regions.py --help
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SUPABASE_URL = "https://oordrnyzlhewhfyfxrko.supabase.co"
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "korea-admin-boundaries"
SIDO_FILE = DATA_DIR / "skorea_provinces_geo.json"
SIGUNGU_FILE = DATA_DIR / "skorea_municipalities_geo.json"

SIDO_SHORT_NAME: dict[str, str] = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
}


def get_service_role_key(args: argparse.Namespace) -> str:
    key = args.key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key and not args.dry_run:
        print("ERROR: Provide service role key as argument or SUPABASE_SERVICE_ROLE_KEY env var.")
        print("Get it from: https://supabase.com/dashboard/project/oordrnyzlhewhfyfxrko/settings/api")
        sys.exit(1)
    return key


def ensure_multipolygon(geometry: dict) -> dict:
    """Wrap Polygon geometry into MultiPolygon for column compatibility."""
    if geometry["type"] == "Polygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [geometry["coordinates"]],
        }
    return geometry


def geom_to_ewkt(geom: dict) -> str:
    """Convert GeoJSON MultiPolygon to EWKT string for PostgREST geometry columns."""
    def ring_wkt(ring: list) -> str:
        return "(" + ",".join(f"{x} {y}" for x, y in ring) + ")"

    def polygon_wkt(polygon: list) -> str:
        return "(" + ",".join(ring_wkt(r) for r in polygon) + ")"

    coords = geom["coordinates"]  # always MultiPolygon after ensure_multipolygon
    inner = ",".join(polygon_wkt(p) for p in coords)
    return f"SRID=4326;MULTIPOLYGON({inner})"


def supabase_post(
    service_key: str,
    table: str,
    payload: dict,
    upsert: bool = True,
) -> int:
    """POST a single row to Supabase REST API. Returns HTTP status."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(payload).encode("utf-8")
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    if upsert:
        headers["Prefer"] = "resolution=merge-duplicates"
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        return e.code


def supabase_get(service_key: str, table: str, select: str, filters: str = "") -> list[dict]:
    """GET rows from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}"
    if filters:
        url += f"&{filters}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def load_geojson(path: Path) -> list[dict]:
    """Load a GeoJSON FeatureCollection and return its features."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data["features"]


def import_sido(service_key: str, dry_run: bool) -> None:
    """Parse and upsert 17 sido (province-level) rows."""
    features = load_geojson(SIDO_FILE)
    print(f"\n=== Importing sido ({len(features)} features) ===\n")

    ok, failed = 0, 0
    for feat in features:
        props = feat["properties"]
        code = props["code"]
        name = props["name"]
        short_name = SIDO_SHORT_NAME.get(name, name)
        geom = ensure_multipolygon(feat["geometry"])

        row = {
            "name": name,
            "short_name": short_name,
            "code": code,
            "level": "sido",
            "parent_id": None,
            "geom": geom_to_ewkt(geom),
        }

        if dry_run:
            print(f"  DRY-RUN  code={code}  {name} ({short_name})")
            ok += 1
            continue

        status = supabase_post(service_key, "regions", row, upsert=True)
        if status in (200, 201):
            print(f"  OK  code={code}  {name} ({short_name})")
            ok += 1
        else:
            print(f"  FAIL  code={code}  {name}  HTTP {status}")
            failed += 1

    print(f"\nSido done: {ok} ok, {failed} failed")


def import_sigungu(service_key: str, dry_run: bool) -> None:
    """Parse and upsert 251 sigungu (municipality-level) rows."""
    if dry_run:
        sido_lookup: dict[str, dict] = {}
        sido_features = load_geojson(SIDO_FILE)
        for feat in sido_features:
            p = feat["properties"]
            sido_lookup[p["code"]] = {
                "id": f"(uuid-for-{p['code']})",
                "name": p["name"],
                "short_name": SIDO_SHORT_NAME.get(p["name"], p["name"]),
            }
    else:
        sido_rows = supabase_get(service_key, "regions", "id,code,name,short_name", "level=eq.sido")
        sido_lookup = {r["code"]: r for r in sido_rows}

    print(f"\nSido lookup built: {len(sido_lookup)} entries")

    features = load_geojson(SIGUNGU_FILE)
    print(f"\n=== Importing sigungu ({len(features)} features) ===\n")

    ok, failed, skipped = 0, 0, 0
    for feat in features:
        props = feat["properties"]
        code = props["code"]
        sigungu_name = props["name"]
        parent_code = code[:2]

        parent = sido_lookup.get(parent_code)
        if not parent:
            print(f"  SKIP  code={code}  {sigungu_name} — no parent sido for prefix {parent_code}")
            skipped += 1
            continue

        full_name = f"{parent['name']} {sigungu_name}"
        short_name = f"{parent['short_name']} {sigungu_name}"
        geom = ensure_multipolygon(feat["geometry"])

        row = {
            "name": full_name,
            "short_name": short_name,
            "code": code,
            "level": "sigungu",
            "parent_id": parent["id"],
            "geom": geom_to_ewkt(geom),
        }

        if dry_run:
            print(f"  DRY-RUN  code={code}  {full_name} ({short_name})")
            ok += 1
            continue

        status = supabase_post(service_key, "regions", row, upsert=True)
        if status in (200, 201):
            print(f"  OK  code={code}  {full_name}")
            ok += 1
        else:
            print(f"  FAIL  code={code}  {full_name}  HTTP {status}")
            failed += 1

    print(f"\nSigungu done: {ok} ok, {failed} failed, {skipped} skipped")


def verify(service_key: str) -> None:
    """Print row counts and NULL-geom check."""
    print("\n=== Verification ===\n")

    sido_rows = supabase_get(service_key, "regions", "id", "level=eq.sido")
    sigungu_rows = supabase_get(service_key, "regions", "id", "level=eq.sigungu")
    all_rows = supabase_get(service_key, "regions", "id,geom", "geom=is.null")

    print(f"  sido:    {len(sido_rows)} rows (expected 17)")
    print(f"  sigungu: {len(sigungu_rows)} rows (expected 251)")
    print(f"  total:   {len(sido_rows) + len(sigungu_rows)}")
    print(f"  NULL geom: {len(all_rows)} rows (expected 0)")

    if len(sido_rows) == 17 and len(sigungu_rows) == 251 and len(all_rows) == 0:
        print("\n  ALL CHECKS PASSED")
    else:
        print("\n  WARNING: counts do not match expected values")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import Korean administrative boundaries into the regions table."
    )
    parser.add_argument(
        "key",
        nargs="?",
        default="",
        help="Supabase service role key (or set SUPABASE_SERVICE_ROLE_KEY env var)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print rows without writing to the database",
    )
    args = parser.parse_args()

    service_key = get_service_role_key(args)

    import_sido(service_key, args.dry_run)
    import_sigungu(service_key, args.dry_run)

    if not args.dry_run:
        verify(service_key)

    print("\nDone.")


if __name__ == "__main__":
    main()
