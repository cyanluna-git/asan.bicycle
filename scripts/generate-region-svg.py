#!/usr/bin/env python3
"""
Generate SVG maps from Korean administrative boundary GeoJSON files.

Outputs:
  public/maps/sido.svg                  — 17 sido (province-level) paths
  public/maps/sigungu-{code}.svg        — sigungu paths per sido (e.g. sigungu-11.svg = 서울)

Sources:
  data/korea-admin-boundaries/skorea_provinces_geo.json
  data/korea-admin-boundaries/skorea_municipalities_geo.json

Usage:
  python3 scripts/generate-region-svg.py --dry-run
  SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/generate-region-svg.py
  python3 scripts/generate-region-svg.py <SERVICE_ROLE_KEY>
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Generator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPABASE_URL = "https://oordrnyzlhewhfyfxrko.supabase.co"

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "korea-admin-boundaries"
SIDO_FILE = DATA_DIR / "skorea_provinces_geo.json"
SIGUNGU_FILE = DATA_DIR / "skorea_municipalities_geo.json"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "maps"

# Douglas-Peucker epsilon values (degrees)
SIDO_EPS: float = 0.01
SIGUNGU_EPS: float = 0.005

# SVG viewport padding (px)
SVG_PADDING: int = 8

# Sigungu codes to exclude from their sido's SVG map (offshore islands far from mainland)
EXCLUDED_SIGUNGU_CODES: set[str] = {
    "37430",  # 울릉군 (경북) — 울릉도, far offshore from mainland
}

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

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def mercator_project(lon: float, lat: float) -> tuple[float, float]:
    """Convert WGS84 lon/lat to Web Mercator (EPSG:3857) in metres."""
    x = math.radians(lon) * 6378137.0
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)) * 6378137.0
    return x, y


def _perp_dist_sq(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Squared perpendicular distance from point P to segment AB."""
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2


def simplify_dp(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """Iterative Douglas-Peucker simplification (avoids recursion depth limits)."""
    if len(points) < 3:
        return points

    eps_sq = epsilon * epsilon
    # Stack holds (start_idx, end_idx) ranges to process
    stack: list[tuple[int, int]] = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = True
    keep[-1] = True

    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue

        max_dist_sq = 0.0
        max_idx = start

        ax, ay = points[start]
        bx, by = points[end]

        for i in range(start + 1, end):
            px, py = points[i]
            d = _perp_dist_sq(px, py, ax, ay, bx, by)
            if d > max_dist_sq:
                max_dist_sq = d
                max_idx = i

        if max_dist_sq > eps_sq:
            keep[max_idx] = True
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [p for i, p in enumerate(points) if keep[i]]


def project_ring(ring: list[list[float]]) -> list[tuple[float, float]]:
    """Project a GeoJSON ring [[lon, lat], ...] to Mercator."""
    return [mercator_project(pt[0], pt[1]) for pt in ring]


# ---------------------------------------------------------------------------
# SVG generation
# ---------------------------------------------------------------------------

def _ring_to_relative_path(
    pts: list[tuple[float, float]],
    scale_x: float,
    scale_y: float,
    offset_x: float,
    offset_y: float,
) -> str:
    """Convert projected ring to relative SVG path commands (m/l/z)."""
    if not pts:
        return ""

    def to_svg(pt: tuple[float, float]) -> tuple[int, int]:
        sx = round((pt[0] - offset_x) * scale_x)
        sy = round((pt[1] - offset_y) * scale_y)
        return sx, sy

    sx0, sy0 = to_svg(pts[0])
    parts = [f"M{sx0},{sy0}"]  # Uppercase M = absolute, safe for multi-polygon subpaths
    prev_sx, prev_sy = sx0, sy0

    for pt in pts[1:]:
        sx, sy = to_svg(pt)
        dx = sx - prev_sx
        dy = sy - prev_sy
        if dx != 0 or dy != 0:
            parts.append(f"l{dx},{dy}")
        prev_sx, prev_sy = sx, sy

    parts.append("z")
    return "".join(parts)


def _compute_bounds(
    all_features: list[dict],
    epsilon: float,
) -> tuple[float, float, float, float]:
    """Compute projected bounding box over all simplified rings."""
    min_x = min_y = math.inf
    max_x = max_y = -math.inf

    for feat in all_features:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = project_ring(ring)
                simplified = simplify_dp(pts, epsilon * 111_000)  # deg → approx metres
                for x, y in simplified:
                    if x < min_x:
                        min_x = x
                    if x > max_x:
                        max_x = x
                    if y < min_y:
                        min_y = y
                    if y > max_y:
                        max_y = y

    return min_x, min_y, max_x, max_y


def _build_svg_path_element(
    feat: dict,
    epsilon_m: float,
    scale_x: float,
    scale_y: float,
    offset_x: float,
    offset_y: float,
    data_code: str,
    data_name: str,
    data_short: str,
    data_id: str,
) -> tuple[str, int]:
    """Build a single <path> element string. Returns (svg_element, point_count)."""
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

    all_d_parts: list[str] = []
    total_points = 0

    for poly in polys:
        for ring in poly:
            pts = project_ring(ring)
            simplified = simplify_dp(pts, epsilon_m)
            total_points += len(simplified)
            if len(simplified) < 2:
                continue
            all_d_parts.append(
                _ring_to_relative_path(simplified, scale_x, scale_y, offset_x, offset_y)
            )

    d = "".join(all_d_parts)
    elem = (
        f'  <path'
        f' d="{d}"'
        f' fill-rule="evenodd"'
        f' data-code="{data_code}"'
        f' data-name="{data_name}"'
        f' data-short="{data_short}"'
        f' data-id="{data_id}"'
        f'/>'
    )
    return elem, total_points


def _svg_wrapper(width: int, height: int, paths: list[str]) -> str:
    """Wrap path elements in an SVG root element."""
    inner = "\n".join(paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg"'
        f' viewBox="0 0 {width} {height}"'
        f' width="{width}" height="{height}">\n'
        f'{inner}\n'
        f'</svg>\n'
    )


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def supabase_get(service_key: str, table: str, select: str, filters: str = "") -> list[dict]:
    """GET rows from Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={urllib.parse.quote(select)}"
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


def fetch_region_uuids(service_key: str, level: str) -> dict[str, str]:
    """Fetch code→uuid mapping from Supabase regions table for a given level."""
    try:
        rows = supabase_get(
            service_key,
            "regions",
            "id,code",
            f"level=eq.{level}",
        )
        return {r["code"]: r["id"] for r in rows}
    except Exception as exc:
        print(f"  WARNING: Failed to fetch {level} UUIDs from Supabase: {exc}")
        return {}


# ---------------------------------------------------------------------------
# Output functions
# ---------------------------------------------------------------------------

def generate_sido_svg(
    service_key: str,
    dry_run: bool,
) -> None:
    """Generate public/maps/sido.svg."""
    with open(SIDO_FILE, encoding="utf-8") as f:
        fc = json.load(f)
    features = fc["features"]

    print(f"\n=== Generating sido.svg ({len(features)} features) ===")

    # Fetch UUIDs
    if dry_run:
        uuid_map: dict[str, str] = {}
    else:
        uuid_map = fetch_region_uuids(service_key, "sido")
        if not uuid_map:
            print("  WARNING: No sido UUIDs fetched — data-id will be empty")

    epsilon_m = SIDO_EPS * 111_000  # degrees → metres (approx)

    # Compute projected bounding box
    min_x, min_y, max_x, max_y = _compute_bounds(features, SIDO_EPS)

    geo_w = max_x - min_x
    geo_h = max_y - min_y

    # Target viewbox ~800×900 (Korea aspect ratio ≈ 0.85)
    target_w = 800
    target_h = 900
    scale = min(
        (target_w - 2 * SVG_PADDING) / geo_w,
        (target_h - 2 * SVG_PADDING) / geo_h,
    )

    svg_w = round(geo_w * scale + 2 * SVG_PADDING)
    # SVG Y axis is flipped (Mercator Y increases up; SVG Y increases down)
    svg_h = round(geo_h * scale + 2 * SVG_PADDING)

    # scale_y is negative to flip
    scale_x = scale
    scale_y = -scale

    # offset so that (min_x, max_y) maps to (SVG_PADDING, SVG_PADDING)
    offset_x = min_x - SVG_PADDING / scale_x
    offset_y = max_y - SVG_PADDING / (-scale_y)  # offset_y based on max_y (top)

    path_elements: list[str] = []
    total_paths = 0
    total_pts = 0

    for feat in sorted(features, key=lambda x: x["properties"]["code"]):
        props = feat["properties"]
        code = props["code"]
        name = props["name"]
        short = SIDO_SHORT_NAME.get(name, name)
        data_id = uuid_map.get(code, "")

        elem, pts = _build_svg_path_element(
            feat, epsilon_m, scale_x, scale_y, offset_x, offset_y,
            data_code=code,
            data_name=name,
            data_short=short,
            data_id=data_id,
        )
        path_elements.append(elem)
        total_paths += 1
        total_pts += pts
        print(f"  {code} {name} ({short})  pts={pts}  id={data_id or '(none)'}")

    svg_content = _svg_wrapper(svg_w, svg_h, path_elements)

    out_path = OUT_DIR / "sido.svg"
    if not dry_run:
        out_path.write_text(svg_content, encoding="utf-8")
        size_kb = out_path.stat().st_size / 1024
        print(f"\n  Written: {out_path}  ({size_kb:.1f} KB)")
    else:
        size_kb = len(svg_content.encode("utf-8")) / 1024
        print(f"\n  DRY-RUN: sido.svg would be ~{size_kb:.1f} KB, {total_paths} paths, {total_pts} pts")

    if size_kb > 200:
        print(f"  WARNING: File exceeds 200 KB target! ({size_kb:.1f} KB)")


def generate_sigungu_svg(
    service_key: str,
    dry_run: bool,
) -> None:
    """Generate public/maps/sigungu-{code}.svg for each sido."""
    with open(SIGUNGU_FILE, encoding="utf-8") as f:
        fc = json.load(f)
    features = fc["features"]

    # Load sido info for grouping
    with open(SIDO_FILE, encoding="utf-8") as f:
        sido_fc = json.load(f)
    sido_by_code: dict[str, dict] = {
        f["properties"]["code"]: f["properties"]
        for f in sido_fc["features"]
    }

    # Group sigungu by 2-char sido prefix
    by_sido: dict[str, list[dict]] = {}
    for feat in features:
        code = feat["properties"]["code"]
        prefix = code[:2]
        by_sido.setdefault(prefix, []).append(feat)

    print(f"\n=== Generating sigungu SVGs ({len(features)} features, {len(by_sido)} sido groups) ===")

    # Fetch UUIDs
    if dry_run:
        uuid_map: dict[str, str] = {}
    else:
        uuid_map = fetch_region_uuids(service_key, "sigungu")
        if not uuid_map:
            print("  WARNING: No sigungu UUIDs fetched — data-id will be empty")

    epsilon_m = SIGUNGU_EPS * 111_000

    total_files = 0
    grand_total_pts = 0

    for sido_code in sorted(by_sido.keys()):
        group = by_sido[sido_code]
        sido_props = sido_by_code.get(sido_code, {})
        sido_name = sido_props.get("name", sido_code)

        print(f"\n  {sido_code} {sido_name} — {len(group)} sigungu")

        # Filter out excluded sigungu (offshore islands etc.)
        group = [f for f in group if f["properties"]["code"] not in EXCLUDED_SIGUNGU_CODES]

        # Compute bounds for this group
        min_x, min_y, max_x, max_y = _compute_bounds(group, SIGUNGU_EPS)
        geo_w = max_x - min_x
        geo_h = max_y - min_y

        # Scale to fit in ~600×600 (square-ish viewbox per region)
        target_dim = 600
        scale = min(
            (target_dim - 2 * SVG_PADDING) / geo_w,
            (target_dim - 2 * SVG_PADDING) / geo_h,
        )

        svg_w = round(geo_w * scale + 2 * SVG_PADDING)
        svg_h = round(geo_h * scale + 2 * SVG_PADDING)

        scale_x = scale
        scale_y = -scale
        offset_x = min_x - SVG_PADDING / scale_x
        offset_y = max_y - SVG_PADDING / (-scale_y)

        path_elements: list[str] = []
        group_pts = 0

        for feat in sorted(group, key=lambda x: x["properties"]["code"]):
            props = feat["properties"]
            code = props["code"]
            if code in EXCLUDED_SIGUNGU_CODES:
                continue
            name = props["name"]  # sigungu short name (GeoJSON field)
            # data-short = data-name per spec (GeoJSON name as-is)
            data_id = uuid_map.get(code, "")

            elem, pts = _build_svg_path_element(
                feat, epsilon_m, scale_x, scale_y, offset_x, offset_y,
                data_code=code,
                data_name=name,
                data_short=name,
                data_id=data_id,
            )
            path_elements.append(elem)
            group_pts += pts
            print(f"    {code} {name}  pts={pts}  id={data_id or '(none)'}")

        grand_total_pts += group_pts

        svg_content = _svg_wrapper(svg_w, svg_h, path_elements)
        out_name = f"sigungu-{sido_code}.svg"
        out_path = OUT_DIR / out_name

        if not dry_run:
            out_path.write_text(svg_content, encoding="utf-8")
            size_kb = out_path.stat().st_size / 1024
            print(f"  Written: {out_path}  ({size_kb:.1f} KB,  {len(group)} paths,  {group_pts} pts)")
            if size_kb > 200:
                print(f"  WARNING: {out_name} exceeds 200 KB target! ({size_kb:.1f} KB)")
        else:
            size_kb = len(svg_content.encode("utf-8")) / 1024
            print(f"  DRY-RUN: {out_name} would be ~{size_kb:.1f} KB, {len(group)} paths, {group_pts} pts")
            if size_kb > 200:
                print(f"  WARNING: {out_name} would exceed 200 KB target!")

        total_files += 1

    print(f"\n  Sigungu done: {total_files} files, {len(features)} total paths, {grand_total_pts} simplified pts")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def get_service_role_key(args: argparse.Namespace) -> str:
    key = args.key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key and not args.dry_run:
        print("ERROR: Provide service role key as argument or SUPABASE_SERVICE_ROLE_KEY env var.")
        print("Get it from: https://supabase.com/dashboard/project/oordrnyzlhewhfyfxrko/settings/api")
        sys.exit(1)
    return key


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate SVG region maps from Korean administrative GeoJSON data."
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
        help="Preview output sizes and path counts without writing files or querying Supabase",
    )
    parser.add_argument(
        "--sido-only",
        action="store_true",
        help="Generate only sido.svg",
    )
    parser.add_argument(
        "--sigungu-only",
        action="store_true",
        help="Generate only sigungu-*.svg files",
    )
    args = parser.parse_args()

    service_key = get_service_role_key(args)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    run_sido = not args.sigungu_only
    run_sigungu = not args.sido_only

    if run_sido:
        generate_sido_svg(service_key, args.dry_run)

    if run_sigungu:
        generate_sigungu_svg(service_key, args.dry_run)

    print("\nDone.")


if __name__ == "__main__":
    main()
