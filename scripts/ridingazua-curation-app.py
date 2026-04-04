#!/usr/bin/env python3
"""
Local Flask app for manual Ridingazua group curation.
"""

from __future__ import annotations

import math
import os
import re
import sqlite3
import textwrap
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, flash, redirect, render_template_string, request, url_for


DEFAULT_SOURCE_DIR = Path("courses/ridingazua-public-gpx-20260308")
DEFAULT_DB_NAME = "ridingazua-staging.sqlite3"
DEFAULT_SIGUNGU_CODE = "34040"
SVG_WIDTH = 340
SVG_HEIGHT = 240
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

SURFACE_KEYWORDS = ("임도", "싱글", "single", "mtb", "산악", "트레일", "trail", "다운힐", "엔듀로", "gravel", "그래블", "비포장", "forest road")
ROAD_KEYWORDS = ("로드", "road", "브레베", "brevet", "란도", "randon", "그란폰도", "granfondo", "fondo", "century", "randonnée", "audax")
PERMANENT_PATTERNS = (r"\bpt[-_\s]?\d+", r"퍼머넌트", r"permanent", r"randonneurs?", r"randoneurs?", r"랜도너스")
BREVET_PATTERNS = (r"브레베", r"brevet", r"audax", r"randonn[ée]e")
FONDO_PATTERNS = (r"그란폰도", r"메디오폰도", r"granfondo", r"mediofondo", r"\bfondo\b")
EVENT_PATTERNS = (r"대회", r"race", r"레이스", r"챌린지", r"challenge")
CROSS_COUNTRY_PATTERNS = (r"국토종주", r"4대강", r"동해안", r"남해안", r"서해안", r"오천자전거길", r"금강자전거길", r"낙동강자전거길")
RANDO_SERIES_PATTERNS = (r"\bsr[-_\s]?\d+", r"\bc[-_\s]?\d{3,4}\b", r"\bbrm\b")

GROUPS_TEMPLATE = """
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ridingazua Curation</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --surface: #0f1c31;
        --surface-2: #132542;
        --line: rgba(148, 163, 184, 0.18);
        --text: #e5eefc;
        --muted: #94a3b8;
        --accent: #38bdf8;
        --success: #22c55e;
        --warning: #f59e0b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #0f2340 0%, var(--bg) 55%);
        color: var(--text);
      }
      .shell {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        min-height: 100vh;
      }
      .sidebar {
        border-right: 1px solid var(--line);
        background: rgba(8, 19, 37, 0.78);
        padding: 20px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow: auto;
      }
      .content {
        padding: 24px;
      }
      .hero, .panel, .group-card, .member-card {
        background: rgba(15, 28, 49, 0.92);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 18px 40px rgba(2, 8, 23, 0.2);
      }
      .hero, .panel { padding: 18px 20px; margin-bottom: 18px; }
      .hero h1 { margin: 0 0 8px; font-size: 1.8rem; }
      .hero p, .meta, .basis, .sidebar-meta { color: var(--muted); }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .filters a, .toolbar a, .sidebar-group a {
        text-decoration: none;
      }
      .chip, button, select, input, textarea {
        border-radius: 12px;
        border: 1px solid var(--line);
        background: rgba(8, 19, 37, 0.92);
        color: var(--text);
      }
      .chip {
        display: inline-flex;
        padding: 8px 12px;
      }
      .chip.active {
        border-color: rgba(56, 189, 248, 0.4);
        background: rgba(56, 189, 248, 0.18);
        color: #bfe8ff;
      }
      .sidebar-group {
        display: block;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 18px;
        margin-bottom: 10px;
        color: var(--text);
        background: rgba(8, 19, 37, 0.85);
      }
      .sidebar-group.active {
        border-color: rgba(56, 189, 248, 0.44);
        box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.12);
      }
      .sidebar-group strong, .member-card h3 { display: block; margin-bottom: 4px; }
      .layout {
        display: grid;
        grid-template-columns: 360px minmax(0, 1fr);
        gap: 18px;
      }
      .group-card { padding: 18px; }
      .group-svg-wrap {
        background: rgba(8, 19, 37, 0.92);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 12px;
        margin-bottom: 14px;
      }
      .group-map { width: 100%; height: auto; display: block; }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;
      }
      .toolbar form { margin: 0; }
      button {
        padding: 10px 14px;
        cursor: pointer;
      }
      .member-list {
        display: grid;
        gap: 14px;
      }
      .member-card { padding: 16px; }
      .member-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 12px 0;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid rgba(148, 163, 184, 0.24);
      }
      .style-road { background: rgba(14, 165, 233, 0.16); color: #7dd3fc; }
      .style-gravel_mtb { background: rgba(245, 158, 11, 0.16); color: #fcd34d; }
      .style-unknown, .program-unknown { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }
      .program-permanent { background: rgba(59, 130, 246, 0.16); color: #93c5fd; }
      .program-brevet { background: rgba(168, 85, 247, 0.16); color: #d8b4fe; }
      .program-fondo { background: rgba(236, 72, 153, 0.16); color: #f9a8d4; }
      .program-event { background: rgba(249, 115, 22, 0.16); color: #fdba74; }
      .scope-local { background: rgba(34, 197, 94, 0.16); color: #86efac; }
      .scope-national_endurance { background: rgba(59, 130, 246, 0.16); color: #93c5fd; }
      .scope-randonneurs { background: rgba(168, 85, 247, 0.16); color: #d8b4fe; }
      .scope-cross_country { background: rgba(236, 72, 153, 0.16); color: #f9a8d4; }
      .scope-unknown { background: rgba(148, 163, 184, 0.14); color: #cbd5e1; }
      label { display: grid; gap: 6px; font-size: 0.9rem; color: #d8e4f7; }
      input, select, textarea { padding: 10px 12px; width: 100%; }
      textarea { min-height: 92px; resize: vertical; }
      .flash {
        margin-bottom: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(34, 197, 94, 0.28);
        background: rgba(34, 197, 94, 0.12);
        color: #bbf7d0;
      }
      .nav-links {
        display: flex;
        gap: 10px;
        margin-top: 14px;
      }
      @media (max-width: 1100px) {
        .shell { grid-template-columns: 1fr; }
        .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
        .layout { grid-template-columns: 1fr; }
      }
      @media (max-width: 720px) {
        .content, .sidebar { padding: 16px; }
        .member-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="hero">
          <h1>큐레이션 앱</h1>
          <p class="sidebar-meta">sigungu {{ sigungu_code }} · {{ status_filter }} · {{ groups|length }} groups</p>
          <div class="filters">
            {% for option in ['pending', 'reviewed', 'promoted', 'all'] %}
              <a class="chip {% if option == status_filter %}active{% endif %}" href="{{ url_for('group_list', sigungu_code=sigungu_code, status=option) }}">{{ option }}</a>
            {% endfor %}
          </div>
        </div>
        {% for group in groups %}
          <a class="sidebar-group {% if selected_group and selected_group.group_id == group.group_id %}active{% endif %}" href="{{ url_for('group_detail', group_id=group.group_id, sigungu_code=sigungu_code, status=status_filter) }}">
            <strong>#{{ group.group_id }} {{ group.canonical_title }}</strong>
            <div class="sidebar-meta">{{ group.sigungu_name or '-' }} · members {{ group.member_count }}</div>
            <div class="sidebar-meta">pending {{ group.pending_count }} · reviewed {{ group.reviewed_count }} · promoted {{ group.promoted_count }}</div>
          </a>
        {% endfor %}
      </aside>
      <main class="content">
        {% with messages = get_flashed_messages() %}
          {% if messages %}
            {% for message in messages %}
              <div class="flash">{{ message }}</div>
            {% endfor %}
          {% endif %}
        {% endwith %}
        {% if not selected_group %}
          <section class="panel">
            <h2>그룹을 선택하세요</h2>
            <p class="meta">왼쪽 목록에서 그룹을 열면 오버레이와 멤버별 검수 폼이 나옵니다.</p>
          </section>
        {% else %}
          <section class="group-card">
            <div class="toolbar">
              <form method="post" action="{{ url_for('bulk_decision', group_id=selected_group.group_id, sigungu_code=sigungu_code, status=status_filter) }}">
                <input type="hidden" name="action" value="canonical_only" />
                <button type="submit">대표만 남김</button>
              </form>
              <form method="post" action="{{ url_for('bulk_decision', group_id=selected_group.group_id, sigungu_code=sigungu_code, status=status_filter) }}">
                <input type="hidden" name="action" value="all_variants" />
                <button type="submit">전체 버전 유지</button>
              </form>
              <form method="post" action="{{ url_for('bulk_decision', group_id=selected_group.group_id, sigungu_code=sigungu_code, status=status_filter) }}">
                <input type="hidden" name="action" value="all_split" />
                <button type="submit">전체 분리</button>
              </form>
              <form method="post" action="{{ url_for('bulk_decision', group_id=selected_group.group_id, sigungu_code=sigungu_code, status=status_filter) }}">
                <input type="hidden" name="action" value="reset" />
                <button type="submit">결정 초기화</button>
              </form>
            </div>
            <div class="layout">
              <div>
                <div class="group-svg-wrap">{{ selected_group.svg|safe }}</div>
                <div class="panel">
                  <h2>{{ selected_group.canonical_title }}</h2>
                  <p class="meta">canonical #{{ selected_group.canonical_course_id }} · members {{ selected_group.member_count }} · {{ selected_group.sigungu_name or '-' }}</p>
                  <p class="meta">pending {{ selected_group.pending_count }} · reviewed {{ selected_group.reviewed_count }} · promoted {{ selected_group.promoted_count }}</p>
                  <div class="nav-links">
                    {% if prev_group_id %}
                      <a class="chip" href="{{ url_for('group_detail', group_id=prev_group_id, sigungu_code=sigungu_code, status=status_filter) }}">이전 그룹</a>
                    {% endif %}
                    {% if next_group_id %}
                      <a class="chip active" href="{{ url_for('group_detail', group_id=next_group_id, sigungu_code=sigungu_code, status=status_filter) }}">다음 그룹</a>
                    {% endif %}
                  </div>
                </div>
              </div>
      <div class="member-list">
                {% for member in selected_group.members %}
                  <section class="member-card">
                    <h3>#{{ member.course_id }} {{ member.title }}</h3>
                    <p class="meta">{{ member.role }} · {{ '%.1f'|format(member.distance_km) }}km / {{ '%.0f'|format(member.elevation_gain_m) }}m</p>
                    <div class="member-grid">
                      <div>
                        <div class="pill program-{{ member.course_program_label }}">{{ member.course_program_label }}</div>
                        <div class="basis">{{ member.course_program_basis }}</div>
                      </div>
                      <div>
                        <div class="pill style-{{ member.ride_style_label }}">{{ member.ride_style_label.replace('_', '/') }}</div>
                        <div class="basis">{{ member.ride_style_basis }}</div>
                      </div>
                      <div>
                        <div class="pill scope-{{ member.route_scope_label }}">{{ member.route_scope_label }}</div>
                        <div class="basis">{{ member.route_scope_basis }}</div>
                      </div>
                    </div>
                    <form method="post" action="{{ url_for('save_member_decision', group_id=selected_group.group_id, course_id=member.course_id, sigungu_code=sigungu_code, status=status_filter) }}">
                      <div class="member-grid">
                        <label>
                          Decision
                          <select name="decision">
                            {% for option in member.allowed_decisions %}
                              <option value="{{ option }}" {% if option == member.current_decision %}selected{% endif %}>{{ option }}</option>
                            {% endfor %}
                          </select>
                        </label>
                        <label>
                          Course Title
                          <input type="text" name="override_title" value="{{ member.override_title or '' }}" placeholder="{{ member.raw_title }}" />
                        </label>
                      </div>
                      <div class="member-grid">
                        <label>
                          Variant Label
                          <input type="text" name="variant_label" value="{{ member.variant_label or '' }}" placeholder="자전거도로 버전 / 카페 경유 등" />
                        </label>
                        <label>
                          Ride Style
                          <select name="ride_style_label">
                            {% for option in ['road', 'gravel_mtb'] %}
                              <option value="{{ option }}" {% if option == member.ride_style_label %}selected{% endif %}>{{ option.replace('_', '/') }}</option>
                            {% endfor %}
                          </select>
                        </label>
                      </div>
                      <div class="member-grid">
                        <label>
                          <span>서비스 등록</span>
                          <input type="checkbox" name="export_approved" {% if member.export_approved %}checked{% endif %} />
                        </label>
                        <label>
                          Route Scope
                          <select name="route_scope_label">
                            {% for option in ['local', 'national_endurance', 'randonneurs', 'cross_country', 'unknown'] %}
                              <option value="{{ option }}" {% if option == member.route_scope_label %}selected{% endif %}>{{ option }}</option>
                            {% endfor %}
                          </select>
                        </label>
                      </div>
                      <label>
                        Review Note
                        <textarea name="reason_note" placeholder="왜 이 결정을 했는지 메모">{{ member.reason_note or '' }}</textarea>
                      </label>
                      <div class="member-grid">
                        <label>
                          Variant Kind
                          <input type="text" name="variant_kind" value="{{ member.variant_kind or '' }}" placeholder="bike_path / detour / climb_variant" />
                        </label>
                        <label>
                          Source
                          <input type="text" value="{{ member.source_url }}" readonly />
                        </label>
                      </div>
                      <div class="toolbar" style="margin-top:12px;">
                        <button type="submit">저장</button>
                        <a class="chip" href="{{ member.source_url }}" target="_blank" rel="noreferrer">원본 열기</a>
                      </div>
                    </form>
                  </section>
                {% endfor %}
              </div>
            </div>
          </section>
        {% endif %}
      </main>
    </div>
  </body>
</html>
"""


@dataclass
class GroupSummary:
    group_id: int
    canonical_course_id: int
    canonical_title: str
    sigungu_name: str | None
    canonical_distance_km: float
    route_scope_label: str
    member_count: int
    pending_count: int
    reviewed_count: int
    promoted_count: int
    svg: str | None = None
    members: list["MemberRecord"] | None = None


@dataclass
class MemberRecord:
    course_id: int
    role: str
    title: str
    raw_title: str
    source_url: str
    gpx_path: str
    distance_km: float
    elevation_gain_m: float
    current_decision: str
    override_title: str | None
    variant_label: str | None
    variant_kind: str | None
    reason_note: str | None
    ride_style_label: str
    ride_style_basis: str
    course_program_label: str
    course_program_basis: str
    route_scope_label: str
    route_scope_basis: str
    export_approved: bool
    allowed_decisions: list[str]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_db_path() -> Path:
    source_dir = Path(os.environ.get("RIDINGAZUA_SOURCE_DIR", DEFAULT_SOURCE_DIR)).resolve()
    return Path(os.environ.get("RIDINGAZUA_DB_PATH", source_dir / DEFAULT_DB_NAME)).resolve()


def open_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(str(get_db_path()))
    connection.row_factory = sqlite3.Row
    ensure_review_schema(connection)
    return connection


def ensure_review_schema(connection: sqlite3.Connection) -> None:
    existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(curation_decision)")}
    if "route_scope_label" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN route_scope_label TEXT")
    if "route_scope_basis" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN route_scope_basis TEXT")
    if "override_title" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN override_title TEXT")
    if "variant_label" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN variant_label TEXT")
    if "variant_kind" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN variant_kind TEXT")
    if "ride_style_label" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN ride_style_label TEXT")
    if "ride_style_basis" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN ride_style_basis TEXT")
    if "export_approved" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN export_approved INTEGER NOT NULL DEFAULT 0")
    if "export_basis" not in existing_columns:
        connection.execute("ALTER TABLE curation_decision ADD COLUMN export_basis TEXT")
    connection.commit()


def detect_namespace(root: ET.Element) -> str | None:
    tag = root.tag or ""
    if tag.startswith("{") and "}" in tag:
        return tag[1:].split("}", 1)[0]
    return None


def collect_points(root: ET.Element, namespace: str | None) -> list[tuple[float, float]]:
    paths = [f".//{{{namespace}}}trkpt", f".//{{{namespace}}}rtept", f".//{{{namespace}}}wpt"] if namespace else [".//trkpt", ".//rtept", ".//wpt"]
    ordered = []
    for path in paths:
        ordered = root.findall(path)
        if ordered:
            break
    points = []
    for element in ordered:
        lat_raw = element.get("lat")
        lng_raw = element.get("lon")
        if lat_raw is None or lng_raw is None:
            continue
        points.append((float(lat_raw), float(lng_raw)))
    if not points:
        raise ValueError("No route points found")
    return points


def load_route_points(gpx_path: Path) -> list[tuple[float, float]]:
    root = ET.parse(gpx_path).getroot()
    return collect_points(root, detect_namespace(root))


def downsample_points(points: list[tuple[float, float]], max_points: int = 120) -> list[tuple[float, float]]:
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / max(max_points - 1, 1)
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


def normalize_svg_points(route: list[tuple[float, float]], bounds: tuple[float, float, float, float], padding: int = 16) -> str:
    min_lat, min_lng, max_lat, max_lng = bounds
    lat_span = max(max_lat - min_lat, 1e-9)
    lng_span = max(max_lng - min_lng, 1e-9)
    drawable_w = SVG_WIDTH - padding * 2
    drawable_h = SVG_HEIGHT - padding * 2
    scale = min(drawable_w / lng_span, drawable_h / lat_span)
    offset_x = padding + (drawable_w - lng_span * scale) / 2
    offset_y = padding + (drawable_h - lat_span * scale) / 2
    coords = []
    for lat, lng in route:
        x = offset_x + (lng - min_lng) * scale
        y = offset_y + (max_lat - lat) * scale
        coords.append(f"{x:.2f},{y:.2f}")
    return " ".join(coords)


def render_group_svg(members: list[MemberRecord]) -> str:
    routes = []
    for member in members:
        routes.append((member, downsample_points(load_route_points(Path(member.gpx_path)))))
    bounds = compute_group_bounds([points for _, points in routes])
    polylines = []
    for index, (member, points) in enumerate(routes):
        color = SVG_COLORS[index % len(SVG_COLORS)]
        stroke_width = 4 if member.role == "canonical" else 2.5
        opacity = 0.95 if member.role == "canonical" else 0.76
        polylines.append(
            f'<polyline points="{normalize_svg_points(points, bounds)}" fill="none" stroke="{color}" stroke-width="{stroke_width}" '
            f'stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}" />'
        )
    return (
        f'<svg viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" class="group-map" role="img" aria-label="group route overlay">'
        f"<rect x='0' y='0' width='{SVG_WIDTH}' height='{SVG_HEIGHT}' rx='16' fill='#081325' />"
        + "".join(polylines)
        + "</svg>"
    )


def classify_course_program(title: str) -> tuple[str, str]:
    normalized = " ".join(title.lower().split())
    if any(re.search(pattern, normalized) for pattern in PERMANENT_PATTERNS):
        return "permanent", "title: permanent pattern"
    if any(re.search(pattern, normalized) for pattern in BREVET_PATTERNS):
        return "brevet", "title: brevet pattern"
    if any(re.search(pattern, normalized) for pattern in FONDO_PATTERNS):
        return "fondo", "title: fondo pattern"
    if any(re.search(pattern, normalized) for pattern in EVENT_PATTERNS):
        return "event", "title: event pattern"
    return "unknown", "title: no event/permanent pattern"


def classify_ride_style(title: str, distance_km: float, elevation_gain_m: float) -> tuple[str, str]:
    normalized = " ".join(title.lower().split())
    climb_rate = elevation_gain_m / max(distance_km, 1.0)
    has_surface = any(keyword in normalized for keyword in SURFACE_KEYWORDS)
    has_road = any(keyword in normalized for keyword in ROAD_KEYWORDS)
    if has_surface:
        return "gravel_mtb", "title: gravel/mtb keyword"
    if has_road:
        return "road", "title: road keyword"
    if distance_km <= 70 and climb_rate >= 22:
        return "gravel_mtb", f"metrics: short + steep ({climb_rate:.1f}m/km)"
    if distance_km >= 90 and climb_rate <= 14:
        return "road", f"metrics: long + moderate ({climb_rate:.1f}m/km)"
    if distance_km >= 140 and climb_rate <= 20:
        return "road", f"metrics: endurance distance ({climb_rate:.1f}m/km)"
    return "gravel_mtb", f"metrics: non-road default ({climb_rate:.1f}m/km)"


def normalize_ride_style_label(label: str | None) -> str:
    normalized = (label or "").strip().lower()
    if normalized == "road":
        return "road"
    if normalized in {"gravel", "mtb", "mixed", "unknown", "gravel_mtb"}:
        return "gravel_mtb"
    return "gravel_mtb"


def classify_route_scope(title: str, distance_km: float, course_program_label: str) -> tuple[str, str]:
    normalized = " ".join(title.lower().split())
    if any(re.search(pattern, normalized) for pattern in CROSS_COUNTRY_PATTERNS):
        return "cross_country", "title: cross-country pattern"
    if any(re.search(pattern, normalized) for pattern in RANDO_SERIES_PATTERNS):
        return "randonneurs", "title: randonneurs series pattern"
    if course_program_label in {"permanent", "brevet"}:
        return "randonneurs", f"program: {course_program_label}"
    if distance_km >= 300:
        return "national_endurance", f"distance: {distance_km:.1f}km"
    if distance_km >= 180:
        return "national_endurance", f"distance: endurance {distance_km:.1f}km"
    return "local", f"distance: local-range {distance_km:.1f}km"


def resolve_effective_route_scope(
    route_scope_label: str | None,
    title: str,
    distance_km: float,
    course_program_label: str,
) -> str:
    if route_scope_label:
        return route_scope_label
    inferred_label, _ = classify_route_scope(title, distance_km, course_program_label)
    return inferred_label


def load_group_summaries(connection: sqlite3.Connection, sigungu_code: str, status_filter: str) -> list[GroupSummary]:
    query = """
      SELECT
        scg.group_id,
        scg.canonical_course_id,
        COALESCE(cdc.override_title, rc.title) AS canonical_title,
        cg.distance_km AS canonical_distance_km,
        cdc.route_scope_label,
        aam.sigungu_name,
        scg.member_count,
        SUM(CASE WHEN cd.decision = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN cd.decision <> 'pending' THEN 1 ELSE 0 END) AS reviewed_count,
        SUM(CASE WHEN COALESCE(cd.export_approved, 0) = 1 THEN 1 ELSE 0 END) AS promoted_count
      FROM similar_course_group scg
      JOIN raw_course rc ON rc.course_id = scg.canonical_course_id
      JOIN course_geometry cg ON cg.course_id = scg.canonical_course_id
      LEFT JOIN curation_decision cdc ON cdc.course_id = scg.canonical_course_id
      LEFT JOIN admin_area_match aam ON aam.course_id = scg.canonical_course_id
      JOIN group_member gm ON gm.group_id = scg.group_id
      JOIN curation_decision cd ON cd.course_id = gm.course_id
      WHERE scg.sigungu_code = ?
      GROUP BY scg.group_id, scg.canonical_course_id, COALESCE(cdc.override_title, rc.title), cg.distance_km, cdc.route_scope_label, aam.sigungu_name, scg.member_count
      ORDER BY scg.member_count DESC, scg.group_id
    """
    rows = connection.execute(query, (sigungu_code,)).fetchall()
    summaries = []
    for row in rows:
        canonical_title = str(row["canonical_title"] or "")
        canonical_distance_km = float(row["canonical_distance_km"] or 0.0)
        course_program_label, _ = classify_course_program(canonical_title)
        route_scope_label = resolve_effective_route_scope(
            row["route_scope_label"],
            canonical_title,
            canonical_distance_km,
            course_program_label,
        )
        if route_scope_label != "local" or canonical_distance_km >= 200:
            continue
        summaries.append(
            GroupSummary(
                group_id=int(row["group_id"]),
                canonical_course_id=int(row["canonical_course_id"]),
                canonical_title=canonical_title,
                sigungu_name=row["sigungu_name"],
                canonical_distance_km=canonical_distance_km,
                route_scope_label=route_scope_label,
                member_count=int(row["member_count"]),
                pending_count=int(row["pending_count"] or 0),
                reviewed_count=int(row["reviewed_count"] or 0),
                promoted_count=int(row["promoted_count"] or 0),
            )
        )
    if status_filter == "pending":
        return [group for group in summaries if group.pending_count > 0]
    if status_filter == "reviewed":
        return [group for group in summaries if group.pending_count == 0 and group.promoted_count == 0]
    if status_filter == "promoted":
        return [group for group in summaries if group.pending_count == 0 and group.promoted_count > 0]
    return summaries


def allowed_decisions(role: str) -> list[str]:
    if role == "canonical":
        return ["canonical_keep", "split_out", "pending"]
    return ["keep_variant", "split_out", "drop_duplicate", "pending"]


def load_group_members(connection: sqlite3.Connection, group_id: int) -> list[MemberRecord]:
    query = """
      SELECT
        gm.course_id,
        gm.role,
        rc.title AS raw_title,
        COALESCE(cd.override_title, rc.title) AS display_title,
        rc.source_url,
        rc.gpx_path,
        cg.distance_km,
        cg.elevation_gain_m,
        cd.decision,
        cd.route_scope_label,
        cd.route_scope_basis,
        cd.export_approved,
        cd.override_title,
        cd.variant_label,
        cd.variant_kind,
        cd.reason_note,
        cd.ride_style_label,
        cd.ride_style_basis,
        rsp.dominant_surface_label,
        rsp.flags_json,
        rsp.paved_share,
        rsp.cycleway_share,
        rsp.gravel_share,
        rsp.trail_share,
        rsp.hiking_risk_share
      FROM group_member gm
      JOIN raw_course rc ON rc.course_id = gm.course_id
      JOIN course_geometry cg ON cg.course_id = gm.course_id
      JOIN curation_decision cd ON cd.course_id = gm.course_id
      LEFT JOIN route_surface_profile rsp ON rsp.course_id = gm.course_id
      WHERE gm.group_id = ?
      ORDER BY CASE WHEN gm.role = 'canonical' THEN 0 ELSE 1 END, gm.course_id
    """
    rows = connection.execute(query, (group_id,)).fetchall()
    members: list[MemberRecord] = []
    for row in rows:
        raw_title = str(row["raw_title"] or "")
        title = str(row["display_title"] or raw_title)
        distance_km = float(row["distance_km"])
        elevation_gain_m = float(row["elevation_gain_m"])
        ride_label, ride_basis = classify_ride_style(title, distance_km, elevation_gain_m)
        if row["dominant_surface_label"]:
            road_share = float(row["paved_share"] or 0.0) + float(row["cycleway_share"] or 0.0)
            gravel_share = float(row["gravel_share"] or 0.0)
            trail_share = float(row["trail_share"] or 0.0) + float(row["hiking_risk_share"] or 0.0)
            ride_label = "road" if str(row["dominant_surface_label"]) == "road" else "gravel_mtb"
            ride_basis = f"osm: road {road_share:.2f}, gravel {gravel_share:.2f}, trail {trail_share:.2f}"
        if row["ride_style_label"]:
            ride_label = normalize_ride_style_label(row["ride_style_label"])
            ride_basis = str(row["ride_style_basis"] or f"manual: {ride_label}")
        program_label, program_basis = classify_course_program(title)
        route_scope_label, route_scope_basis = classify_route_scope(title, distance_km, program_label)
        if row["route_scope_label"]:
            route_scope_label = str(row["route_scope_label"])
            route_scope_basis = str(row["route_scope_basis"] or "manual override")
        members.append(
            MemberRecord(
                course_id=int(row["course_id"]),
                role=str(row["role"]),
                title=title,
                raw_title=raw_title,
                source_url=str(row["source_url"] or ""),
                gpx_path=str(row["gpx_path"] or ""),
                distance_km=distance_km,
                elevation_gain_m=elevation_gain_m,
                current_decision=str(row["decision"] or "pending"),
                override_title=row["override_title"],
                variant_label=row["variant_label"],
                variant_kind=row["variant_kind"],
                reason_note=row["reason_note"],
                ride_style_label=ride_label,
                ride_style_basis=ride_basis,
                course_program_label=program_label,
                course_program_basis=program_basis,
                route_scope_label=route_scope_label,
                route_scope_basis=route_scope_basis,
                export_approved=bool(row["export_approved"]),
                allowed_decisions=allowed_decisions(str(row["role"])),
            )
        )
    return members


def load_group_detail(connection: sqlite3.Connection, group_id: int) -> GroupSummary | None:
    row = connection.execute(
        """
        SELECT
          scg.group_id,
          scg.canonical_course_id,
          COALESCE(cdc.override_title, rc.title) AS canonical_title,
          cg.distance_km AS canonical_distance_km,
          cdc.route_scope_label,
          aam.sigungu_name,
          scg.member_count,
          SUM(CASE WHEN cd.decision = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN cd.decision <> 'pending' THEN 1 ELSE 0 END) AS reviewed_count,
          SUM(CASE WHEN COALESCE(cd.export_approved, 0) = 1 THEN 1 ELSE 0 END) AS promoted_count
        FROM similar_course_group scg
        JOIN raw_course rc ON rc.course_id = scg.canonical_course_id
        JOIN course_geometry cg ON cg.course_id = scg.canonical_course_id
        LEFT JOIN curation_decision cdc ON cdc.course_id = scg.canonical_course_id
        LEFT JOIN admin_area_match aam ON aam.course_id = scg.canonical_course_id
        JOIN group_member gm ON gm.group_id = scg.group_id
        JOIN curation_decision cd ON cd.course_id = gm.course_id
        WHERE scg.group_id = ?
        GROUP BY scg.group_id, scg.canonical_course_id, COALESCE(cdc.override_title, rc.title), cg.distance_km, cdc.route_scope_label, aam.sigungu_name, scg.member_count
        """,
        (group_id,),
    ).fetchone()
    if row is None:
        return None
    members = load_group_members(connection, group_id)
    canonical_title = str(row["canonical_title"] or "")
    canonical_distance_km = float(row["canonical_distance_km"] or 0.0)
    course_program_label, _ = classify_course_program(canonical_title)
    route_scope_label = resolve_effective_route_scope(
        row["route_scope_label"],
        canonical_title,
        canonical_distance_km,
        course_program_label,
    )
    return GroupSummary(
        group_id=int(row["group_id"]),
        canonical_course_id=int(row["canonical_course_id"]),
        canonical_title=canonical_title,
        sigungu_name=row["sigungu_name"],
        canonical_distance_km=canonical_distance_km,
        route_scope_label=route_scope_label,
        member_count=int(row["member_count"]),
        pending_count=int(row["pending_count"] or 0),
        reviewed_count=int(row["reviewed_count"] or 0),
        promoted_count=int(row["promoted_count"] or 0),
        svg=render_group_svg(members),
        members=members,
    )


def next_prev_group_ids(groups: list[GroupSummary], current_group_id: int) -> tuple[int | None, int | None]:
    ids = [group.group_id for group in groups]
    if current_group_id not in ids:
        return None, None
    index = ids.index(current_group_id)
    prev_group_id = ids[index - 1] if index > 0 else None
    next_group_id = ids[index + 1] if index < len(ids) - 1 else None
    return prev_group_id, next_group_id


def save_decision(
    connection: sqlite3.Connection,
    group_id: int,
    course_id: int,
    role: str,
    decision: str,
    route_scope_label: str | None,
    ride_style_label: str | None,
    export_approved: bool | None,
    override_title: str | None,
    variant_label: str,
    variant_kind: str,
    reason_note: str,
) -> None:
    canonical_row = connection.execute(
        "SELECT canonical_course_id FROM similar_course_group WHERE group_id = ?",
        (group_id,),
    ).fetchone()
    if canonical_row is None:
        raise ValueError(f"group {group_id} not found")
    canonical_course_id = int(canonical_row["canonical_course_id"])
    current_row = connection.execute(
        "SELECT override_title, export_approved FROM curation_decision WHERE course_id = ?",
        (course_id,),
    ).fetchone()
    effective_override_title = (
        current_row["override_title"]
        if override_title is None and current_row is not None
        else (override_title.strip() or None if override_title is not None else None)
    )
    effective_route_scope_label = route_scope_label.strip() if route_scope_label else None
    effective_route_scope_basis = f"manual: {effective_route_scope_label}" if effective_route_scope_label else None
    effective_ride_style_label = normalize_ride_style_label(ride_style_label) if ride_style_label else None
    effective_ride_style_basis = f"manual: {effective_ride_style_label}" if effective_ride_style_label else None
    effective_export_approved = int(bool(export_approved)) if export_approved is not None else int(current_row["export_approved"] or 0) if current_row is not None else 0
    if decision == "pending":
        effective_export_approved = 0
    effective_export_basis = "manual: approved" if effective_export_approved else None
    merge_group_id = group_id if decision in {"keep_variant", "drop_duplicate", "canonical_keep"} else None
    if decision == "split_out":
        merge_group_id = None
    reviewed_at = utc_now() if decision != "pending" else None
    reviewer = "local-curation-ui" if decision != "pending" else None
    reason_code = "manual_ui" if decision != "pending" else None
    connection.execute(
        """
        UPDATE curation_decision
        SET
          decision = ?,
          canonical_course_id = ?,
          merge_group_id = ?,
          route_scope_label = ?,
          route_scope_basis = ?,
          ride_style_label = ?,
          ride_style_basis = ?,
          export_approved = ?,
          export_basis = ?,
          override_title = ?,
          variant_label = ?,
          variant_kind = ?,
          reviewer = ?,
          reason_code = ?,
          reason_note = ?,
          reviewed_at = ?,
          updated_at = ?
        WHERE course_id = ?
        """,
        (
            decision,
            canonical_course_id if decision in {"keep_variant", "drop_duplicate", "canonical_keep"} else (course_id if role == "canonical" else None),
            merge_group_id,
            effective_route_scope_label,
            effective_route_scope_basis,
            effective_ride_style_label,
            effective_ride_style_basis,
            effective_export_approved,
            effective_export_basis,
            effective_override_title,
            variant_label.strip() or None,
            variant_kind.strip() or None,
            reviewer,
            reason_code,
            reason_note.strip() or None,
            reviewed_at,
            utc_now(),
            course_id,
        ),
    )
    connection.commit()


def apply_bulk_action(connection: sqlite3.Connection, group_id: int, action: str) -> None:
    rows = connection.execute("SELECT course_id, role FROM group_member WHERE group_id = ?", (group_id,)).fetchall()
    for row in rows:
        role = str(row["role"])
        course_id = int(row["course_id"])
        if action == "canonical_only":
            decision = "canonical_keep" if role == "canonical" else "drop_duplicate"
            route_scope_label = None
            ride_style_label = None
            export_approved = None
            override_title = None
            variant_label = ""
            variant_kind = ""
            note = "bulk: canonical only"
        elif action == "all_variants":
            decision = "canonical_keep" if role == "canonical" else "keep_variant"
            route_scope_label = None
            ride_style_label = None
            export_approved = None
            override_title = None
            variant_label = ""
            variant_kind = ""
            note = "bulk: keep variants"
        elif action == "all_split":
            decision = "canonical_keep" if role == "canonical" else "split_out"
            route_scope_label = None
            ride_style_label = None
            export_approved = None
            override_title = None
            variant_label = ""
            variant_kind = ""
            note = "bulk: split out"
        elif action == "reset":
            decision = "pending"
            route_scope_label = None
            ride_style_label = None
            export_approved = False
            override_title = None
            variant_label = ""
            variant_kind = ""
            note = ""
        else:
            raise ValueError(f"Unsupported action: {action}")
        save_decision(connection, group_id, course_id, role, decision, route_scope_label, ride_style_label, export_approved, override_title, variant_label, variant_kind, note)


app = Flask(__name__)
app.secret_key = os.environ.get("RIDINGAZUA_CURATION_SECRET", "ridingazua-curation-dev")


@app.route("/")
def index():
    return redirect(url_for("group_list", sigungu_code=request.args.get("sigungu_code", DEFAULT_SIGUNGU_CODE), status=request.args.get("status", "pending")))


@app.route("/groups")
def group_list():
    sigungu_code = request.args.get("sigungu_code", DEFAULT_SIGUNGU_CODE)
    status_filter = request.args.get("status", "pending")
    connection = open_connection()
    groups = load_group_summaries(connection, sigungu_code, status_filter)
    selected_group = None
    selected_group_id = request.args.get("group_id", type=int)
    if selected_group_id:
        selected_group = load_group_detail(connection, selected_group_id)
    response = render_template_string(
        GROUPS_TEMPLATE,
        groups=groups,
        selected_group=selected_group,
        sigungu_code=sigungu_code,
        status_filter=status_filter,
        prev_group_id=None,
        next_group_id=None,
    )
    connection.close()
    return response


@app.route("/groups/<int:group_id>")
def group_detail(group_id: int):
    sigungu_code = request.args.get("sigungu_code", DEFAULT_SIGUNGU_CODE)
    status_filter = request.args.get("status", "pending")
    connection = open_connection()
    groups = load_group_summaries(connection, sigungu_code, status_filter)
    selected_group = load_group_detail(connection, group_id)
    if selected_group is None:
        connection.close()
        flash(f"group {group_id} not found")
        return redirect(url_for("group_list", sigungu_code=sigungu_code, status=status_filter))
    prev_group_id, next_group_id = next_prev_group_ids(groups, group_id)
    response = render_template_string(
        GROUPS_TEMPLATE,
        groups=groups,
        selected_group=selected_group,
        sigungu_code=sigungu_code,
        status_filter=status_filter,
        prev_group_id=prev_group_id,
        next_group_id=next_group_id,
    )
    connection.close()
    return response


@app.post("/groups/<int:group_id>/bulk-decision")
def bulk_decision(group_id: int):
    sigungu_code = request.args.get("sigungu_code", DEFAULT_SIGUNGU_CODE)
    status_filter = request.args.get("status", "pending")
    action = request.form.get("action", "canonical_only")
    connection = open_connection()
    apply_bulk_action(connection, group_id, action)
    connection.close()
    flash(f"group {group_id} bulk action applied: {action}")
    return redirect(url_for("group_detail", group_id=group_id, sigungu_code=sigungu_code, status=status_filter))


@app.post("/groups/<int:group_id>/courses/<int:course_id>/decision")
def save_member_decision(group_id: int, course_id: int):
    sigungu_code = request.args.get("sigungu_code", DEFAULT_SIGUNGU_CODE)
    status_filter = request.args.get("status", "pending")
    connection = open_connection()
    row = connection.execute("SELECT role FROM group_member WHERE group_id = ? AND course_id = ?", (group_id, course_id)).fetchone()
    if row is None:
        connection.close()
        flash(f"course {course_id} not found in group {group_id}")
        return redirect(url_for("group_detail", group_id=group_id, sigungu_code=sigungu_code, status=status_filter))
    save_decision(
        connection,
        group_id,
        course_id,
        str(row["role"]),
        request.form.get("decision", "pending"),
        request.form.get("route_scope_label", ""),
        request.form.get("ride_style_label", ""),
        request.form.get("export_approved") == "on",
        request.form.get("override_title", ""),
        request.form.get("variant_label", ""),
        request.form.get("variant_kind", ""),
        request.form.get("reason_note", ""),
    )
    connection.close()
    flash(f"saved #{course_id}")
    return redirect(url_for("group_detail", group_id=group_id, sigungu_code=sigungu_code, status=status_filter))


def main() -> int:
    host = os.environ.get("RIDINGAZUA_CURATION_HOST", "127.0.0.1")
    port = int(os.environ.get("RIDINGAZUA_CURATION_PORT", "4210"))
    app.run(host=host, port=port, debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
