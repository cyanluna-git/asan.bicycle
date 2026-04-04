#!/usr/bin/env python3
"""
Generate HTML and CSV review reports for grouped Ridingazua courses.

Primary use case:
- review Asan similarity groups visually
- decide canonical-only / keep-as-variant / split / drop-duplicate
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import re
import sqlite3
import textwrap
from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
DEFAULT_OUTPUT_SUBDIR = Path("reports/asan-group-review")
DEFAULT_SIGUNGU_CODE = "34040"
SVG_WIDTH = 320
SVG_HEIGHT = 220
SVG_COLORS = [
    "#38bdf8",
    "#fb7185",
    "#f59e0b",
    "#22c55e",
    "#a78bfa",
    "#f97316",
    "#14b8a6",
    "#eab308",
]


@dataclass
class Member:
    group_id: int
    course_id: int
    canonical_course_id: int
    role: str
    title: str
    source_url: str
    gpx_path: str
    distance_km: float
    elevation_gain_m: float
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    sigungu_name: str | None
    similarity_score: float | None
    decision_hint: str | None
    start_distance_m: float | None
    ride_style_label: str
    ride_style_basis: str
    course_program_label: str
    course_program_basis: str


MTB_KEYWORDS = (
    "임도",
    "싱글",
    "single",
    "mtb",
    "산악",
    "트레일",
    "trail",
    "다운힐",
    "엔듀로",
)

ROAD_KEYWORDS = (
    "로드",
    "road",
    "브레베",
    "brevet",
    "란도",
    "randon",
    "그란폰도",
    "granfondo",
    "fondo",
    "century",
    "randonnée",
    "audax",
)

GRAVEL_KEYWORDS = (
    "gravel",
    "그래블",
    "비포장",
    "forest road",
)

PERMANENT_PATTERNS = (
    r"\bpt[-_\s]?\d+",
    r"퍼머넌트",
    r"permanent",
    r"randonneurs?",
    r"randoneurs?",
    r"랜도너스",
)

BREVET_PATTERNS = (
    r"브레베",
    r"brevet",
    r"audax",
    r"randonn[ée]e",
)

FONDO_PATTERNS = (
    r"그란폰도",
    r"메디오폰도",
    r"granfondo",
    r"mediofondo",
    r"\bfondo\b",
)

EVENT_PATTERNS = (
    r"대회",
    r"race",
    r"레이스",
    r"챌린지",
    r"challenge",
)


def classify_ride_style(title: str, distance_km: float, elevation_gain_m: float) -> tuple[str, str]:
    title_normalized = " ".join(title.lower().split())
    climb_rate = elevation_gain_m / max(distance_km, 1.0)

    has_mtb_keyword = any(keyword in title_normalized for keyword in MTB_KEYWORDS)
    has_road_keyword = any(keyword in title_normalized for keyword in ROAD_KEYWORDS)
    has_gravel_keyword = any(keyword in title_normalized for keyword in GRAVEL_KEYWORDS)

    if has_gravel_keyword and has_road_keyword:
        return "mixed", "title: road+gravel keywords"
    if has_mtb_keyword and has_road_keyword:
        return "mixed", "title: road+mtb keywords"
    if has_gravel_keyword and has_mtb_keyword:
        return "mixed", "title: gravel+mtb keywords"
    if has_gravel_keyword:
        return "gravel", "title: gravel keyword"
    if has_mtb_keyword:
        return "mtb", "title: mtb keyword"
    if has_road_keyword:
        return "road", "title: road keyword"

    if distance_km <= 70 and climb_rate >= 22:
        return "mtb", f"metrics: short + steep ({climb_rate:.1f}m/km)"
    if distance_km >= 90 and climb_rate <= 14:
        return "road", f"metrics: long + moderate ({climb_rate:.1f}m/km)"
    if distance_km >= 140 and climb_rate <= 20:
        return "road", f"metrics: endurance distance ({climb_rate:.1f}m/km)"
    if 12 <= climb_rate <= 24 and 40 <= distance_km <= 120:
        return "mixed", f"metrics: balanced ({climb_rate:.1f}m/km)"
    return "unknown", f"metrics: ambiguous ({climb_rate:.1f}m/km)"


def classify_course_program(title: str) -> tuple[str, str]:
    title_normalized = " ".join(title.lower().split())
    if any(re.search(pattern, title_normalized) for pattern in PERMANENT_PATTERNS):
        return "permanent", "title: permanent pattern"
    if any(re.search(pattern, title_normalized) for pattern in BREVET_PATTERNS):
        return "brevet", "title: brevet pattern"
    if any(re.search(pattern, title_normalized) for pattern in FONDO_PATTERNS):
        return "fondo", "title: fondo pattern"
    if any(re.search(pattern, title_normalized) for pattern in EVENT_PATTERNS):
        return "event", "title: event pattern"
    return "unknown", "title: no event/permanent pattern"


def detect_namespace(root: ET.Element) -> str | None:
    tag = root.tag or ""
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return None


def collect_points(root: ET.Element, namespace: str | None) -> list[tuple[float, float]]:
    if namespace:
        trkpt_path = f".//{{{namespace}}}trkpt"
        rtept_path = f".//{{{namespace}}}rtept"
        wpt_path = f".//{{{namespace}}}wpt"
    else:
        trkpt_path = ".//trkpt"
        rtept_path = ".//rtept"
        wpt_path = ".//wpt"

    ordered_points = root.findall(trkpt_path)
    if not ordered_points:
        ordered_points = root.findall(rtept_path)
    if not ordered_points:
        ordered_points = root.findall(wpt_path)

    points: list[tuple[float, float]] = []
    for element in ordered_points:
        lat_raw = element.get("lat")
        lng_raw = element.get("lon")
        if lat_raw is None or lng_raw is None:
            continue
        points.append((float(lat_raw), float(lng_raw)))
    return points


def load_route_points(gpx_path: Path) -> list[tuple[float, float]]:
    root = ET.parse(gpx_path).getroot()
    points = collect_points(root, detect_namespace(root))
    if not points:
        raise ValueError(f"No route points found in {gpx_path}")
    return points


def downsample_points(points: list[tuple[float, float]], max_points: int = 120) -> list[tuple[float, float]]:
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(index * step)] for index in range(max_points)]


def compute_group_bounds(routes: list[list[tuple[float, float]]]) -> tuple[float, float, float, float]:
    first_lat, first_lng = routes[0][0]
    min_lat = max_lat = first_lat
    min_lng = max_lng = first_lng
    for route in routes:
        for lat, lng in route:
            min_lat = min(min_lat, lat)
            max_lat = max(max_lat, lat)
            min_lng = min(min_lng, lng)
            max_lng = max(max_lng, lng)
    return min_lat, min_lng, max_lat, max_lng


def normalize_svg_points(
    route: list[tuple[float, float]],
    bounds: tuple[float, float, float, float],
    width: int = SVG_WIDTH,
    height: int = SVG_HEIGHT,
    padding: int = 14,
) -> str:
    min_lat, min_lng, max_lat, max_lng = bounds
    lat_span = max(max_lat - min_lat, 1e-9)
    lng_span = max(max_lng - min_lng, 1e-9)
    drawable_w = width - padding * 2
    drawable_h = height - padding * 2
    scale = min(drawable_w / lng_span, drawable_h / lat_span)
    offset_x = padding + (drawable_w - lng_span * scale) / 2
    offset_y = padding + (drawable_h - lat_span * scale) / 2

    coords = []
    for lat, lng in route:
        x = offset_x + (lng - min_lng) * scale
        y = offset_y + (max_lat - lat) * scale
        coords.append(f"{x:.2f},{y:.2f}")
    return " ".join(coords)


def render_group_svg(routes: list[tuple[Member, list[tuple[float, float]]]]) -> str:
    bounds = compute_group_bounds([points for _, points in routes])
    polylines = []
    for index, (member, points) in enumerate(routes):
        color = SVG_COLORS[index % len(SVG_COLORS)]
        stroke_width = 4 if member.role == "canonical" else 2.5
        opacity = 0.95 if member.role == "canonical" else 0.72
        polyline = normalize_svg_points(points, bounds)
        polylines.append(
            f'<polyline points="{polyline}" fill="none" stroke="{color}" stroke-width="{stroke_width}" '
            f'stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}" />'
        )
    return (
        f'<svg viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" class="group-map" role="img" aria-label="group route overlay">'
        f"<rect x='0' y='0' width='{SVG_WIDTH}' height='{SVG_HEIGHT}' rx='16' fill='#081325' />"
        + "".join(polylines)
        + "</svg>"
    )


def render_group_section(group_id: int, members: list[Member]) -> str:
    routes = []
    for member in members:
        points = downsample_points(load_route_points(Path(member.gpx_path)))
        routes.append((member, points))

    canonical = next(member for member in members if member.role == "canonical")
    group_svg = render_group_svg(routes)
    rows = []
    for index, member in enumerate(members):
        color = SVG_COLORS[index % len(SVG_COLORS)]
        suggestion = (
            "대표 유지"
            if member.role == "canonical"
            else ("버전 유지" if member.decision_hint == "variant" else "중복 삭제 검토")
        )
        rows.append(
            f"""
            <tr>
              <td><span class="swatch" style="background:{color}"></span>{html.escape(member.role)}</td>
              <td><a href="{html.escape(member.source_url)}" target="_blank" rel="noreferrer">#{member.course_id}</a></td>
              <td>{html.escape(member.title)}</td>
              <td><span class="program-pill program-{html.escape(member.course_program_label)}">{html.escape(member.course_program_label)}</span><div class="style-basis">{html.escape(member.course_program_basis)}</div></td>
              <td><span class="style-pill style-{html.escape(member.ride_style_label)}">{html.escape(member.ride_style_label)}</span><div class="style-basis">{html.escape(member.ride_style_basis)}</div></td>
              <td>{member.distance_km:.1f}km / {member.elevation_gain_m:.0f}m</td>
              <td>{html.escape(member.decision_hint or "-")}</td>
              <td>{"" if member.similarity_score is None else f"{member.similarity_score:.3f}"}</td>
              <td>{"" if member.start_distance_m is None else f"{member.start_distance_m:.0f}m"}</td>
              <td>{html.escape(suggestion)}</td>
            </tr>
            """
        )

    return f"""
      <section class="group-card">
        <div class="group-header">
          <div>
            <p class="eyebrow">Group {group_id}</p>
            <h2>{html.escape(canonical.title)}</h2>
            <p class="meta">canonical #{canonical.course_id} · members {len(members)} · {html.escape(canonical.sigungu_name or "-")}</p>
          </div>
          <div class="decision-cheatsheet">
            <span>대표만 남김</span>
            <span>버전으로 유지</span>
            <span>분리</span>
            <span>중복 삭제</span>
          </div>
        </div>
        <div class="group-body">
          <div class="map-wrap">{group_svg}</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>role</th>
                  <th>course</th>
                  <th>title</th>
                  <th>program</th>
                  <th>style</th>
                  <th>metrics</th>
                  <th>hint</th>
                  <th>score</th>
                  <th>start Δ</th>
                  <th>review suggestion</th>
                </tr>
              </thead>
              <tbody>
                {''.join(rows)}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    """


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate grouped course review HTML/CSV reports")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--db-path", type=Path, default=None)
    parser.add_argument("--sigungu-code", default=DEFAULT_SIGUNGU_CODE)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--limit-groups", type=int, default=None)
    return parser.parse_args()


def load_members(connection: sqlite3.Connection, sigungu_code: str, limit_groups: int | None) -> list[Member]:
    params: list[object] = [sigungu_code]
    group_limit_clause = ""
    if limit_groups is not None:
        group_limit_clause = "LIMIT ?"
        params.append(limit_groups)

    query = f"""
      WITH target_groups AS (
        SELECT group_id
        FROM similar_course_group
        WHERE sigungu_code = ?
        ORDER BY member_count DESC, group_id
        {group_limit_clause}
      )
      SELECT
        gm.group_id,
        scg.canonical_course_id,
        gm.course_id,
        gm.role,
        rc.title,
        rc.source_url,
        rc.gpx_path,
        cg.distance_km,
        cg.elevation_gain_m,
        cg.start_lat,
        cg.start_lng,
        cg.end_lat,
        cg.end_lng,
        aam.sigungu_name,
        sce.similarity_score,
        sce.decision_hint,
        sce.start_distance_m,
        rsp.dominant_surface_label,
        rsp.confidence AS surface_confidence,
        rsp.flags_json,
        rsp.paved_share,
        rsp.cycleway_share,
        rsp.gravel_share,
        rsp.trail_share,
        rsp.hiking_risk_share
      FROM group_member gm
      JOIN target_groups tg ON tg.group_id = gm.group_id
      JOIN similar_course_group scg ON scg.group_id = gm.group_id
      JOIN raw_course rc ON rc.course_id = gm.course_id
      JOIN course_geometry cg ON cg.course_id = gm.course_id
      LEFT JOIN admin_area_match aam ON aam.course_id = gm.course_id
      LEFT JOIN similar_course_edge sce
        ON (
          (sce.course_id_a = scg.canonical_course_id AND sce.course_id_b = gm.course_id)
          OR
          (sce.course_id_b = scg.canonical_course_id AND sce.course_id_a = gm.course_id)
        )
      LEFT JOIN route_surface_profile rsp ON rsp.course_id = gm.course_id
      ORDER BY gm.group_id, CASE WHEN gm.role = 'canonical' THEN 0 ELSE 1 END, gm.course_id
    """
    rows = connection.execute(query, params).fetchall()
    members: list[Member] = []
    for row in rows:
        title = str(row["title"] or "")
        distance_km = float(row["distance_km"])
        elevation_gain_m = float(row["elevation_gain_m"])
        ride_style_label, ride_style_basis = classify_ride_style(title, distance_km, elevation_gain_m)
        course_program_label, course_program_basis = classify_course_program(title)
        if row["dominant_surface_label"]:
            shares = []
            if row["paved_share"] is not None or row["cycleway_share"] is not None:
                road_share = float(row["paved_share"] or 0.0) + float(row["cycleway_share"] or 0.0)
                shares.append(f"road {road_share:.2f}")
            if row["gravel_share"] is not None:
                shares.append(f"gravel {float(row['gravel_share']):.2f}")
            if row["trail_share"] is not None or row["hiking_risk_share"] is not None:
                trail_share = float(row["trail_share"] or 0.0) + float(row["hiking_risk_share"] or 0.0)
                shares.append(f"trail {trail_share:.2f}")
            ride_style_label = str(row["dominant_surface_label"])
            ride_style_basis = "osm: " + ", ".join(shares)
            if row["flags_json"]:
                try:
                    flags = json.loads(str(row["flags_json"]))
                except json.JSONDecodeError:
                    flags = {}
                if flags.get("hiking_risk"):
                    ride_style_basis += " · hiking risk"
        members.append(
            Member(
                group_id=int(row["group_id"]),
                course_id=int(row["course_id"]),
                canonical_course_id=int(row["canonical_course_id"]),
                role=str(row["role"]),
                title=title,
                source_url=str(row["source_url"] or ""),
                gpx_path=str(row["gpx_path"] or ""),
                distance_km=distance_km,
                elevation_gain_m=elevation_gain_m,
                start_lat=float(row["start_lat"]),
                start_lng=float(row["start_lng"]),
                end_lat=float(row["end_lat"]),
                end_lng=float(row["end_lng"]),
                sigungu_name=row["sigungu_name"],
                similarity_score=None if row["similarity_score"] is None else float(row["similarity_score"]),
                decision_hint=row["decision_hint"],
                start_distance_m=None if row["start_distance_m"] is None else float(row["start_distance_m"]),
                ride_style_label=ride_style_label,
                ride_style_basis=ride_style_basis,
                course_program_label=course_program_label,
                course_program_basis=course_program_basis,
            )
        )
    return members


def write_csv(path: Path, members: list[Member]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "group_id",
                "canonical_course_id",
                "course_id",
                "role",
                "title",
                "course_program_label",
                "course_program_basis",
                "ride_style_label",
                "ride_style_basis",
                "distance_km",
                "elevation_gain_m",
                "decision_hint",
                "similarity_score",
                "start_distance_m",
                "review_decision",
                "variant_label",
                "review_note",
                "source_url",
                "gpx_path",
            ]
        )
        for member in members:
            writer.writerow(
                [
                    member.group_id,
                    member.canonical_course_id,
                    member.course_id,
                    member.role,
                    member.title,
                    member.course_program_label,
                    member.course_program_basis,
                    member.ride_style_label,
                    member.ride_style_basis,
                    round(member.distance_km, 2),
                    round(member.elevation_gain_m, 1),
                    member.decision_hint or "",
                    "" if member.similarity_score is None else round(member.similarity_score, 3),
                    "" if member.start_distance_m is None else round(member.start_distance_m, 1),
                    "",
                    "",
                    "",
                    member.source_url,
                    member.gpx_path,
                ]
            )


def write_html(path: Path, members: list[Member], sigungu_code: str) -> None:
    groups: dict[int, list[Member]] = {}
    for member in members:
        groups.setdefault(member.group_id, []).append(member)

    sections = [render_group_section(group_id, group_members) for group_id, group_members in groups.items()]
    html_doc = f"""<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>아산시 유사그룹 검수 리포트</title>
    <style>
      :root {{
        color-scheme: dark;
        --bg: #07111f;
        --surface: #0f1c31;
        --surface-2: #132542;
        --line: rgba(148, 163, 184, 0.18);
        --text: #e5eefc;
        --muted: #94a3b8;
        --accent: #38bdf8;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #0f2340 0%, var(--bg) 55%);
        color: var(--text);
      }}
      main {{
        width: min(1400px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }}
      .hero {{
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(249, 115, 22, 0.10));
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 24px;
        margin-bottom: 24px;
      }}
      .hero h1 {{ margin: 0 0 8px; font-size: 2rem; }}
      .hero p {{ margin: 0; color: var(--muted); line-height: 1.6; }}
      .group-card {{
        background: rgba(15, 28, 49, 0.92);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 20px;
        margin-bottom: 18px;
        box-shadow: 0 18px 40px rgba(2, 8, 23, 0.3);
      }}
      .group-header {{
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 16px;
      }}
      .eyebrow {{
        margin: 0 0 6px;
        color: var(--accent);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }}
      .group-header h2 {{ margin: 0 0 6px; font-size: 1.35rem; }}
      .meta {{ margin: 0; color: var(--muted); }}
      .decision-cheatsheet {{
        display: grid;
        gap: 6px;
        font-size: 0.88rem;
        color: #cbd5e1;
        background: rgba(8, 19, 37, 0.9);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
      }}
      .group-body {{
        display: grid;
        gap: 18px;
        grid-template-columns: 340px minmax(0, 1fr);
      }}
      .map-wrap {{
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(8, 19, 37, 0.9);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 10px;
      }}
      .group-map {{ width: 100%; height: auto; }}
      .table-wrap {{
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 18px;
      }}
      .style-pill {{
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid rgba(148, 163, 184, 0.24);
      }}
      .program-pill {{
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid rgba(148, 163, 184, 0.24);
      }}
      .program-permanent {{
        background: rgba(59, 130, 246, 0.16);
        color: #93c5fd;
      }}
      .program-brevet {{
        background: rgba(168, 85, 247, 0.16);
        color: #d8b4fe;
      }}
      .program-fondo {{
        background: rgba(236, 72, 153, 0.16);
        color: #f9a8d4;
      }}
      .program-event {{
        background: rgba(249, 115, 22, 0.16);
        color: #fdba74;
      }}
      .program-unknown {{
        background: rgba(148, 163, 184, 0.14);
        color: #cbd5e1;
      }}
      .style-road {{
        background: rgba(14, 165, 233, 0.16);
        color: #7dd3fc;
      }}
      .style-mtb {{
        background: rgba(249, 115, 22, 0.16);
        color: #fdba74;
      }}
      .style-gravel {{
        background: rgba(245, 158, 11, 0.16);
        color: #fcd34d;
      }}
      .style-mixed {{
        background: rgba(234, 179, 8, 0.16);
        color: #fde68a;
      }}
      .style-unknown {{
        background: rgba(148, 163, 184, 0.14);
        color: #cbd5e1;
      }}
      .style-basis {{
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.78rem;
        line-height: 1.35;
      }}
      table {{ width: 100%; border-collapse: collapse; min-width: 760px; }}
      th, td {{
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        vertical-align: top;
        font-size: 0.92rem;
      }}
      th {{
        color: #cbd5e1;
        background: rgba(8, 19, 37, 0.9);
        position: sticky;
        top: 0;
      }}
      tr:last-child td {{ border-bottom: 0; }}
      a {{ color: var(--accent); text-decoration: none; }}
      .swatch {{
        width: 12px;
        height: 12px;
        border-radius: 999px;
        display: inline-block;
        margin-right: 8px;
        vertical-align: middle;
      }}
      @media (max-width: 980px) {{
        .group-body {{ grid-template-columns: 1fr; }}
        main {{ width: min(100vw - 24px, 1400px); }}
      }}
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>아산시 유사그룹 검수 리포트</h1>
        <p>sigungu_code={html.escape(sigungu_code)} 그룹만 추렸습니다. 각 그룹에서 대표만 남길지, 버전으로 유지할지, 그룹을 분리할지 판단한 뒤 CSV의 <code>review_decision</code>, <code>variant_label</code>, <code>review_note</code>를 채우면 됩니다. <code>style</code> 라벨은 title 키워드와 거리/고도 비율 기반의 휴리스틱이므로 최종 검수는 육안으로 확인해야 합니다.</p>
      </section>
      {''.join(sections)}
    </main>
  </body>
</html>
"""
    path.write_text(textwrap.dedent(html_doc), encoding="utf-8")


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    db_path = (args.db_path or source_dir / DEFAULT_DB_NAME).resolve()
    output_dir = (args.output_dir or source_dir / DEFAULT_OUTPUT_SUBDIR).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not db_path.exists():
        raise SystemExit(f"Staging DB not found: {db_path}")

    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    members = load_members(connection, args.sigungu_code, args.limit_groups)
    if not members:
        raise SystemExit(f"No grouped members found for sigungu_code={args.sigungu_code}")

    csv_path = output_dir / f"group-review-{args.sigungu_code}.csv"
    html_path = output_dir / f"group-review-{args.sigungu_code}.html"
    write_csv(csv_path, members)
    write_html(html_path, members, args.sigungu_code)

    print(
        json.dumps(
            {
                "dbPath": str(db_path),
                "outputDir": str(output_dir),
                "csvPath": str(csv_path),
                "htmlPath": str(html_path),
                "groups": len({member.group_id for member in members}),
                "members": len(members),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
