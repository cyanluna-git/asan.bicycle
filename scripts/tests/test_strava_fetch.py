"""Tests for scripts/strava-fetch-uphills.py.

All HTTP access is mocked with unittest.mock so the suite runs entirely
offline — no Strava token, no Supabase service key, no network.
"""

from __future__ import annotations

import io
import json
import urllib.error
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Fake HTTP response helper
# ---------------------------------------------------------------------------

class _FakeResponse:
    """Minimal stand-in for the object returned by urllib.request.urlopen."""

    def __init__(self, body: bytes, status: int = 200, headers: dict | None = None):
        self._body = body
        self.status = status
        self.headers = headers or {}

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def _json_response(payload) -> _FakeResponse:
    return _FakeResponse(
        json.dumps(payload).encode("utf-8"),
        status=200,
        headers={"X-RateLimit-Usage": "1,1", "X-RateLimit-Limit": "200,2000"},
    )


def _http_error(code: int, retry_after: str = "1") -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://www.strava.com/api/v3/segments/1",
        code=code,
        msg="rate limited",
        hdrs={"Retry-After": retry_after},  # type: ignore[arg-type]
        fp=io.BytesIO(b"{}"),
    )


# ---------------------------------------------------------------------------
# Polyline encode / decode
# ---------------------------------------------------------------------------

def test_polyline_canonical_google_example(strava_module) -> None:
    """The Google docs example string must decode to the published coordinates."""
    encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    decoded = strava_module.decode_polyline(encoded)
    assert decoded == [
        (38.5, -120.2),
        (40.7, -120.95),
        (43.252, -126.453),
    ]


def test_polyline_encode_decode_roundtrip(strava_module) -> None:
    sample = [
        (33.36000, 126.49000),
        (33.36500, 126.49500),
        (33.37000, 126.50000),
        (33.37500, 126.50500),
    ]
    encoded = strava_module._encode_polyline(sample)
    decoded = strava_module.decode_polyline(encoded)
    assert len(decoded) == len(sample)
    for (orig_lat, orig_lng), (dec_lat, dec_lng) in zip(sample, decoded):
        assert orig_lat == pytest.approx(dec_lat, abs=1e-5)
        assert orig_lng == pytest.approx(dec_lng, abs=1e-5)


def test_polyline_empty_string(strava_module) -> None:
    assert strava_module.decode_polyline("") == []


def test_polyline_none_returns_empty(strava_module) -> None:
    assert strava_module.decode_polyline(None) == []  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# WKT helpers
# ---------------------------------------------------------------------------

def test_wkt_linestring_lng_first_order(strava_module) -> None:
    wkt = strava_module.to_wkt_linestring([(37.1, 127.1), (37.2, 127.2)])
    assert wkt.startswith("SRID=4326;LINESTRING(")
    # PostGIS expects lng first then lat inside LINESTRING.
    assert "127.1 37.1" in wkt
    assert "127.2 37.2" in wkt


def test_wkt_point_lng_first_order(strava_module) -> None:
    wkt = strava_module.to_wkt_point((37.5, 127.0))
    assert wkt == "SRID=4326;POINT(127.0 37.5)"


# ---------------------------------------------------------------------------
# build_row
# ---------------------------------------------------------------------------

def _sample_detail(**overrides) -> dict:
    encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    detail = {
        "id": 12345,
        "name": "Test Climb",
        "distance": 1500.0,
        "average_grade": 7.5,
        "maximum_grade": 12.3,
        "total_elevation_gain": 120.0,
        "climb_category": 3,
        "start_latlng": [38.5, -120.2],
        "end_latlng": [43.252, -126.453],
        "map": {"polyline": encoded},
    }
    detail.update(overrides)
    return detail


def test_build_row_from_valid_detail(strava_module) -> None:
    row = strava_module.build_row(_sample_detail(), "Test Region")
    assert row is not None
    assert row["strava_segment_id"] == 12345
    assert row["name"] == "Test Climb"
    assert row["distance_m"] == 1500.0
    assert row["avg_grade"] == pytest.approx(7.5)
    assert row["max_grade"] == pytest.approx(12.3)
    assert row["elevation_gain_m"] == 120.0
    assert row["climb_category"] == 3
    assert row["route"].startswith("SRID=4326;LINESTRING(")
    assert row["start_latlng"] == "SRID=4326;POINT(-120.2 38.5)"
    assert row["end_latlng"] == "SRID=4326;POINT(-126.453 43.252)"
    assert row["raw_strava"]["id"] == 12345


def test_build_row_missing_polyline_returns_none(strava_module) -> None:
    detail = _sample_detail()
    detail["map"] = {"polyline": ""}
    assert strava_module.build_row(detail, "Region") is None


def test_build_row_missing_map_returns_none(strava_module) -> None:
    detail = _sample_detail()
    detail["map"] = None
    assert strava_module.build_row(detail, "Region") is None


def test_build_row_single_point_polyline_returns_none(strava_module) -> None:
    # A polyline with fewer than 2 coords cannot form a LineString.
    single_point_encoded = strava_module._encode_polyline([(33.0, 126.0)])
    detail = _sample_detail()
    detail["map"] = {"polyline": single_point_encoded}
    assert strava_module.build_row(detail, "Region") is None


def test_build_row_clamps_grades(strava_module) -> None:
    row = strava_module.build_row(
        _sample_detail(average_grade=150.0, maximum_grade=-200.0), "Region"
    )
    assert row is not None
    assert row["avg_grade"] == pytest.approx(99.99)
    assert row["max_grade"] == pytest.approx(-99.99)


def test_build_row_null_grades_pass_through(strava_module) -> None:
    row = strava_module.build_row(
        _sample_detail(average_grade=None, maximum_grade=None), "Region"
    )
    assert row is not None
    assert row["avg_grade"] is None
    assert row["max_grade"] is None


# ---------------------------------------------------------------------------
# strava_request — HTTP mocking
# ---------------------------------------------------------------------------

def test_strava_request_success(strava_module) -> None:
    payload = {"id": 42, "name": "OK Climb"}
    with patch.object(strava_module.urllib.request, "urlopen", return_value=_json_response(payload)):
        with patch.object(strava_module.time, "sleep"):
            data = strava_module.strava_request("/segments/42", "fake-token", sleep_between=0.0)
    assert data == payload


def test_fetch_segment_returns_detail(strava_module) -> None:
    payload = _sample_detail()
    with patch.object(strava_module.urllib.request, "urlopen", return_value=_json_response(payload)):
        with patch.object(strava_module.time, "sleep"):
            detail = strava_module.fetch_segment(1, "fake-token", 0.0)
    assert detail["id"] == 12345
    assert detail["name"] == "Test Climb"


def test_explore_bbox_filters_to_segments_key(strava_module) -> None:
    payload = {"segments": [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]}
    with patch.object(strava_module.urllib.request, "urlopen", return_value=_json_response(payload)):
        with patch.object(strava_module.time, "sleep"):
            segs = strava_module.explore_bbox(
                {"sw_lat": 33.0, "sw_lng": 126.0, "ne_lat": 33.5, "ne_lng": 126.5, "region": "Jeju"},
                "fake-token",
                0.0,
            )
    assert segs == payload["segments"]


def test_explore_bbox_empty_when_no_segments_key(strava_module) -> None:
    with patch.object(strava_module.urllib.request, "urlopen", return_value=_json_response([])):
        with patch.object(strava_module.time, "sleep"):
            segs = strava_module.explore_bbox(
                {"sw_lat": 0, "sw_lng": 0, "ne_lat": 1, "ne_lng": 1, "region": "x"},
                "fake-token",
                0.0,
            )
    assert segs == []


# ---------------------------------------------------------------------------
# Bbox-driven pipeline: filter segments that fall outside caller's bbox.
# (The caller inspects seg['id'] + seg['distance'] to decide whether to keep.)
# ---------------------------------------------------------------------------

def test_oneshot_loop_filters_out_of_bbox_segments(strava_module) -> None:
    """Simulate a bbox-filter step on the segments we keep from explore_bbox."""
    bbox = {"sw_lat": 33.0, "sw_lng": 126.0, "ne_lat": 33.5, "ne_lng": 126.5, "region": "Jeju"}

    candidate_segments = [
        {"id": 1, "distance": 1000, "start_latlng": [33.2, 126.3]},  # inside
        {"id": 2, "distance": 1200, "start_latlng": [40.0, 130.0]},  # outside
        {"id": 3, "distance": 200, "start_latlng": [33.1, 126.1]},   # inside but too short
    ]

    def inside(p: list[float]) -> bool:
        lat, lng = p
        return bbox["sw_lat"] <= lat <= bbox["ne_lat"] and bbox["sw_lng"] <= lng <= bbox["ne_lng"]

    kept = [
        s for s in candidate_segments
        if inside(s["start_latlng"]) and s["distance"] >= 500
    ]
    assert [s["id"] for s in kept] == [1]


# ---------------------------------------------------------------------------
# Rate limit handling
# ---------------------------------------------------------------------------

def test_rate_limit_recovers_after_single_429(strava_module) -> None:
    """First call hits 429, retry succeeds. Must not raise."""
    payload = {"id": 1}
    responses = [
        _http_error(429),  # first attempt — 429
        _json_response(payload),  # retry — success
    ]

    def fake_urlopen(*_args, **_kwargs):
        result = responses.pop(0)
        if isinstance(result, urllib.error.HTTPError):
            raise result
        return result

    with patch.object(strava_module.urllib.request, "urlopen", side_effect=fake_urlopen):
        with patch.object(strava_module.time, "sleep"):  # skip real sleeps
            data = strava_module.strava_request("/segments/1", "fake-token", sleep_between=0.0)
    assert data == payload


def test_rate_limit_raises_after_consecutive_429(strava_module) -> None:
    """Two consecutive 429s → RateLimitedError."""
    def fake_urlopen(*_args, **_kwargs):
        raise _http_error(429)

    with patch.object(strava_module.urllib.request, "urlopen", side_effect=fake_urlopen):
        with patch.object(strava_module.time, "sleep"):
            with pytest.raises(strava_module.RateLimitedError):
                strava_module.strava_request("/segments/1", "fake-token", sleep_between=0.0)


def test_non_429_http_error_propagates(strava_module) -> None:
    def fake_urlopen(*_args, **_kwargs):
        raise _http_error(500)

    with patch.object(strava_module.urllib.request, "urlopen", side_effect=fake_urlopen):
        with patch.object(strava_module.time, "sleep"):
            with pytest.raises(urllib.error.HTTPError):
                strava_module.strava_request("/segments/1", "fake-token", sleep_between=0.0)


# ---------------------------------------------------------------------------
# upsert_segment — duplicate handling
# ---------------------------------------------------------------------------

def test_upsert_segment_uses_merge_duplicates_header(strava_module) -> None:
    captured_requests: list = []

    def fake_urlopen(req, timeout=None):
        captured_requests.append(req)
        return _FakeResponse(b"", status=204)

    row = {"strava_segment_id": 777, "name": "Dup Climb"}
    with patch.object(strava_module.urllib.request, "urlopen", side_effect=fake_urlopen):
        first = strava_module.upsert_segment("https://x.supabase.co", "key", row)
        second = strava_module.upsert_segment("https://x.supabase.co", "key", row)

    assert first == 204
    assert second == 204
    assert len(captured_requests) == 2
    for req in captured_requests:
        # PostgREST upsert: must target famous_uphills with on_conflict=strava_segment_id
        assert "famous_uphills" in req.full_url
        assert "on_conflict=strava_segment_id" in req.full_url
        # Header keys get title-cased by Request.add_header.
        prefer = req.headers.get("Prefer", "")
        assert "resolution=merge-duplicates" in prefer


def test_upsert_segment_error_returns_status_code(strava_module) -> None:
    def fake_urlopen(req, timeout=None):
        raise _http_error(422)

    row = {"strava_segment_id": 1}
    with patch.object(strava_module.urllib.request, "urlopen", side_effect=fake_urlopen):
        status = strava_module.upsert_segment("https://x.supabase.co", "key", row)
    assert status == 422


# ---------------------------------------------------------------------------
# _maybe_throttle — guard kicks in near usage limit.
# ---------------------------------------------------------------------------

def test_maybe_throttle_sleeps_when_near_limit(strava_module) -> None:
    with patch.object(strava_module.time, "sleep") as sleep_mock:
        strava_module._maybe_throttle("190,500", "200,2000")
    assert sleep_mock.called


def test_maybe_throttle_does_not_sleep_when_safe(strava_module) -> None:
    with patch.object(strava_module.time, "sleep") as sleep_mock:
        strava_module._maybe_throttle("10,100", "200,2000")
    assert not sleep_mock.called


def test_maybe_throttle_handles_malformed_header(strava_module) -> None:
    with patch.object(strava_module.time, "sleep") as sleep_mock:
        strava_module._maybe_throttle("", "")
    assert not sleep_mock.called
