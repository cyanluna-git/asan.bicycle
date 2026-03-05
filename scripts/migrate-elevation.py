#!/usr/bin/env python3
"""
Migrate existing courses to include 3D elevation data (route_geojson with [lng, lat, ele] coords).

Usage:
  python3 scripts/migrate-elevation.py <SERVICE_ROLE_KEY>

Or set SUPABASE_SERVICE_ROLE_KEY env var:
  SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/migrate-elevation.py

Get SERVICE_ROLE_KEY from: https://supabase.com/dashboard/project/oordrnyzlhewhfyfxrko/settings/api
"""

import sys, os, json, math, re
import xml.etree.ElementTree as ET
import urllib.request, urllib.error

SUPABASE_URL = "https://oordrnyzlhewhfyfxrko.supabase.co"
SERVICE_ROLE_KEY = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SERVICE_ROLE_KEY:
    print("ERROR: Provide service role key as argument or SUPABASE_SERVICE_ROLE_KEY env var.")
    print("Get it from: https://supabase.com/dashboard/project/oordrnyzlhewhfyfxrko/settings/api")
    sys.exit(1)

COURSES_DIR = os.path.join(os.path.dirname(__file__), "..", "courses")

# Mapping: course ID → GPX filename
COURSE_GPX_MAP = {
    "b02923db-3722-43ad-a51c-65c56a802789": "153k+광천-수덕사-신리성지.gpx",
    "237fa81b-2622-4fe7-81b7-2444ac70a3ed": "90km_1040m.gpx",
    "f76d0c8c-8647-4785-9c41-a7fc805972aa": "솔뫼성지.gpx",
    "b1670fa2-4ce1-419e-af4c-ba6d4ab9d7e9": "180km+&+2500m.gpx",
    "47b3d18a-0dbd-4f53-b631-2fd02768e0dc": "75km+900m+차령+-+마곡사+역방향.gpx",
    "2fabeef6-3b4f-4f4f-944e-c6a6f0220a23": "76k유구~공주대~장복리+.gpx",
    "6cb52c2a-4a2f-4e17-93b9-12ae7ee58083": "COURSE_414629427.gpx",
    "0b0f6288-b571-41e2-859f-010e063ccc84": "TalkFile_215k_이화령_찍턴.gpx.gpx",
    "c6c900e4-865b-4228-ad82-48756ee3fa20": "그란폰도241008.gpx",
    "99e59147-e1ae-4cf1-8336-78ffd6967f14": "대청호_한바퀴_200k.gpx",
    "cd9757d7-1bb6-435f-8754-2e777fd1b2cd": "메디오폰도241008.gpx",
    "e5df8519-7833-4d16-8e41-9177ac22ff9a": "무창포해수욕장.gpx",
    "10d45fe0-9aad-41c7-b7a3-820bff12ddcb": "순천향대-수덕사-갈산-예산-신창_120.gpx",
    "15c0d8d3-d263-4625-8240-cc0a10d35f3b": "예당평화로_오전빤.gpx",
    "c6485d3d-c49b-4e8e-a851-fcd5ac810408": "좌부-곡두-정안-동혈고개-공주-유구-대술.gpx",
    "4dc5d1e0-7872-448d-a8bc-bba821d60e2d": "초급_곡차_솔치복귀_.gpx",
    "0ac5f348-8150-44c3-aeeb-f4863b40990d": "초급_정안_전의.gpx",
    "a5c2b23e-6518-44fc-bb02-bfbb7b9297d1": "칠갑산+130k.gpx",
    "0043b139-91f8-4f9e-90b2-8c54d5011fec": "피어추.gpx",
    "c2c3caaf-b0b0-42cc-b1ba-730bc070046d": "화성-천북-서산_190k.gpx",
}

NS = {
    'gpx': 'http://www.topografix.com/GPX/1/1',
    'gpx10': 'http://www.topografix.com/GPX/1/0',
}


def parse_gpx(filepath):
    """Parse GPX file, return list of [lng, lat, ele] coordinates."""
    tree = ET.parse(filepath)
    root = tree.getroot()

    # Detect namespace
    tag = root.tag
    if 'topografix.com/GPX/1/1' in tag:
        ns = 'gpx'
    else:
        ns = 'gpx10'

    coords = []

    # Try trkpt first
    for trkpt in root.iter(f'{{{NS[ns]}}}trkpt'):
        lat = float(trkpt.get('lat'))
        lon = float(trkpt.get('lon'))
        ele_el = trkpt.find(f'{{{NS[ns]}}}ele')
        ele = float(ele_el.text) if ele_el is not None else 0.0
        coords.append([lon, lat, ele])

    # Fall back to wpt if no trkpt
    if not coords:
        for wpt in root.iter(f'{{{NS[ns]}}}wpt'):
            lat = float(wpt.get('lat'))
            lon = float(wpt.get('lon'))
            ele_el = wpt.find(f'{{{NS[ns]}}}ele')
            ele = float(ele_el.text) if ele_el is not None else 0.0
            coords.append([lon, lat, ele])

    return coords


def downsample(coords, max_points=800):
    """Keep every Nth point to stay under max_points."""
    if len(coords) <= max_points:
        return coords
    step = len(coords) / max_points
    return [coords[int(i * step)] for i in range(max_points)]


def build_geojson(coords):
    """Build a GeoJSON FeatureCollection with a single LineString."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
                "properties": {},
            }
        ],
    }


def patch_course(course_id, geojson):
    """PATCH route_geojson for a course via Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/courses?id=eq.{course_id}"
    payload = json.dumps({"route_geojson": geojson}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="PATCH",
        headers={
            "Content-Type": "application/json",
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:200]}")
        return e.code


def fetch_courses():
    """Fetch all course IDs and titles."""
    url = f"{SUPABASE_URL}/rest/v1/courses?select=id,title&order=created_at.asc"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    print("=== Elevation Migration ===\n")

    # Fetch actual course data from DB to verify IDs
    print("Fetching courses from DB...")
    try:
        courses = fetch_courses()
    except Exception as e:
        print(f"ERROR fetching courses: {e}")
        sys.exit(1)

    db_courses = {c["id"]: c["title"] for c in courses}
    print(f"Found {len(db_courses)} courses in DB\n")

    ok, skipped, failed = 0, 0, 0

    for course_id, gpx_filename in COURSE_GPX_MAP.items():
        title = db_courses.get(course_id, "UNKNOWN")
        gpx_path = os.path.join(COURSES_DIR, gpx_filename)

        if course_id not in db_courses:
            print(f"  SKIP  [{course_id[:8]}] not in DB — {gpx_filename}")
            skipped += 1
            continue

        if not os.path.exists(gpx_path):
            print(f"  SKIP  {title[:45]!r} — file not found: {gpx_filename}")
            skipped += 1
            continue

        print(f"  Processing: {title[:50]!r}")

        try:
            coords = parse_gpx(gpx_path)
            if not coords:
                print(f"    WARNING: No coordinates found in {gpx_filename}")
                skipped += 1
                continue

            has_ele = any(c[2] != 0 for c in coords)
            coords_ds = downsample(coords, 800)
            geojson = build_geojson(coords_ds)

            status = patch_course(course_id, geojson)
            if status in (200, 204):
                print(f"    OK  {len(coords)} pts → {len(coords_ds)} pts | ele:{has_ele}")
                ok += 1
            else:
                print(f"    FAIL  HTTP {status}")
                failed += 1
        except Exception as e:
            print(f"    ERROR: {e}")
            failed += 1

    print(f"\nDone: {ok} updated, {skipped} skipped, {failed} failed")


if __name__ == "__main__":
    main()
