"""Tests for scripts/ridingazua-export-queue.py difficulty + duration logic.

Formula under test (from `infer_difficulty`):

    stress = distance_km + elevation_gain_m / 120
    stress <= 40  → "easy"
    stress <= 95  → "moderate"
    otherwise     → "hard"

Boundary behaviour:
    exactly 40     → easy
    40.01          → moderate
    exactly 95     → moderate
    95.01          → hard
"""

from __future__ import annotations

import math

import pytest


# ---------------------------------------------------------------------------
# infer_difficulty — boundary conditions
# ---------------------------------------------------------------------------

def test_stress_exactly_40_is_easy(export_queue_module) -> None:
    # distance 40km, 0m elev → stress = 40 exactly → easy
    assert export_queue_module.infer_difficulty(40.0, 0.0) == "easy"


def test_stress_just_above_40_is_moderate(export_queue_module) -> None:
    assert export_queue_module.infer_difficulty(40.01, 0.0) == "moderate"


def test_stress_exactly_95_is_moderate(export_queue_module) -> None:
    assert export_queue_module.infer_difficulty(95.0, 0.0) == "moderate"


def test_stress_just_above_95_is_hard(export_queue_module) -> None:
    assert export_queue_module.infer_difficulty(95.01, 0.0) == "hard"


# ---------------------------------------------------------------------------
# infer_difficulty — realistic shapes
# ---------------------------------------------------------------------------

def test_flat_short_ride_is_easy(export_queue_module) -> None:
    assert export_queue_module.infer_difficulty(20.0, 50.0) == "easy"


def test_long_flat_ride_is_moderate(export_queue_module) -> None:
    # 60 km + 600 m / 120 = 60 + 5 = 65 → moderate
    assert export_queue_module.infer_difficulty(60.0, 600.0) == "moderate"


def test_elevation_pushes_easy_to_moderate(export_queue_module) -> None:
    # 35 km alone is easy, but 35 km + 1200 m elev = 35 + 10 = 45 → moderate
    assert export_queue_module.infer_difficulty(35.0, 1200.0) == "moderate"


def test_mountain_ride_is_hard(export_queue_module) -> None:
    # 80 km + 2500 m / 120 ≈ 80 + 20.83 ≈ 100.83 → hard
    assert export_queue_module.infer_difficulty(80.0, 2500.0) == "hard"


def test_elevation_boundary_pushes_to_hard(export_queue_module) -> None:
    # distance 90, elev 601 → stress = 90 + 5.008... = 95.008 → hard
    assert export_queue_module.infer_difficulty(90.0, 601.0) == "hard"
    # distance 90, elev 600 → stress = 90 + 5 = 95 exactly → moderate
    assert export_queue_module.infer_difficulty(90.0, 600.0) == "moderate"


def test_zero_distance_zero_elev_is_easy(export_queue_module) -> None:
    assert export_queue_module.infer_difficulty(0.0, 0.0) == "easy"


# ---------------------------------------------------------------------------
# estimate_duration_min
# ---------------------------------------------------------------------------

def test_duration_easy_speed(export_queue_module) -> None:
    # 40 km @ 20 km/h = 120 min
    assert export_queue_module.estimate_duration_min(40.0, "easy") == 120


def test_duration_moderate_speed(export_queue_module) -> None:
    # 50 km @ 17 km/h = 176.47 → round → 176
    assert export_queue_module.estimate_duration_min(50.0, "moderate") == 176


def test_duration_hard_speed(export_queue_module) -> None:
    # 100 km @ 14 km/h = 428.57 → round → 429
    assert export_queue_module.estimate_duration_min(100.0, "hard") == 429


def test_duration_minimum_30_min_floor(export_queue_module) -> None:
    # A 5 km easy ride is 15 min, but the function floors at 30 min.
    assert export_queue_module.estimate_duration_min(5.0, "easy") == 30


def test_duration_unknown_difficulty_raises(export_queue_module) -> None:
    with pytest.raises(KeyError):
        export_queue_module.estimate_duration_min(10.0, "extreme")


# ---------------------------------------------------------------------------
# Reference formula sanity — make sure `stress` matches the documented one.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("distance_km", "elevation_m", "expected"),
    [
        (10.0, 0.0, "easy"),
        (40.0, 0.0, "easy"),
        (40.0, 1.0, "moderate"),  # 40 + 0.0083 → 40.0083 > 40 → moderate
        (94.0, 120.0, "moderate"),  # 94 + 1 = 95 → moderate
        (94.0, 121.0, "hard"),  # 94 + 1.0083 = 95.0083 → hard
        (0.0, 12000.0, "hard"),  # 0 + 100 → hard
    ],
)
def test_difficulty_table(export_queue_module, distance_km: float, elevation_m: float, expected: str) -> None:
    assert export_queue_module.infer_difficulty(distance_km, elevation_m) == expected
