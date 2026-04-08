"""Shared fixtures for the scripts test suite.

The target scripts (`ridingazua-stage.py`, `ridingazua-export-queue.py`,
`strava-fetch-uphills.py`) use hyphenated filenames and therefore cannot be
imported with a normal `import` statement. We use `importlib.util` to load
them as modules so we can exercise their pure-Python helpers directly.
"""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
import types
from pathlib import Path

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SCHEMA_PATH = SCRIPTS_DIR / "sql" / "ridingazua_staging_schema.sql"


def _load_script_module(module_name: str, filename: str) -> types.ModuleType:
    path = SCRIPTS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session")
def stage_module() -> types.ModuleType:
    """Load scripts/ridingazua-stage.py as an importable module."""
    return _load_script_module("ridingazua_stage", "ridingazua-stage.py")


@pytest.fixture(scope="session")
def export_queue_module() -> types.ModuleType:
    """Load scripts/ridingazua-export-queue.py as an importable module."""
    return _load_script_module("ridingazua_export_queue", "ridingazua-export-queue.py")


@pytest.fixture(scope="session")
def strava_module() -> types.ModuleType:
    """Load scripts/strava-fetch-uphills.py as an importable module."""
    return _load_script_module("strava_fetch_uphills", "strava-fetch-uphills.py")


@pytest.fixture()
def temp_db(tmp_path: Path) -> sqlite3.Connection:
    """Create a fresh SQLite DB with the staging schema applied.

    Uses tmp_path so each test gets its own isolated file-backed DB.
    """
    db_path = tmp_path / "staging.sqlite3"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    yield conn
    conn.close()


@pytest.fixture()
def valid_gpx_path() -> Path:
    return FIXTURES_DIR / "valid.gpx"


@pytest.fixture()
def minimal_gpx_path() -> Path:
    return FIXTURES_DIR / "minimal.gpx"


@pytest.fixture()
def invalid_gpx_path() -> Path:
    return FIXTURES_DIR / "invalid.gpx"


@pytest.fixture()
def empty_gpx_path() -> Path:
    return FIXTURES_DIR / "empty.gpx"
