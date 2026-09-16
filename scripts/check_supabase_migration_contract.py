#!/usr/bin/env python3
"""Static safety gate for the active Supabase migration path."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "supabase" / "migrations"
LEGACY = ROOT / "supabase" / "migrations_legacy"
SYSTEM_SCHEMAS = {"auth", "storage", "realtime", "graphql", "vault"}

VERSION_RE = re.compile(r"^(\d{14})_[^/]+\.sql$")
CREATE_TABLE_RE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?"
    r"(?:(?P<schema>public|private|auth)\.)?(?P<table>[a-zA-Z_][\w$]*)",
    re.I,
)
POLICY_RE = re.compile(
    r"create\s+policy\s+[^;]+?\s+on\s+"
    r"(?:(?P<schema>[a-zA-Z_][\w$]*)\.)?(?P<table>[a-zA-Z_][\w$]*)",
    re.I | re.S,
)

def fail(message: str) -> None:
    print(f"migration-replay-gate: {message}", file=sys.stderr)
    raise SystemExit(1)

def main() -> None:
    if not ACTIVE.is_dir():
        fail("missing supabase/migrations directory")
    files = sorted(ACTIVE.glob("*.sql"))
    if not files:
        fail("no active SQL migrations found")

    versions: list[str] = []
    for path in files:
        match = VERSION_RE.match(path.name)
        if not match:
            fail(f"invalid migration filename: {path.name}")
        versions.append(match.group(1))
    if len(versions) != len(set(versions)):
        fail("duplicate migration version detected")

    active_text = "\n".join(path.read_text(encoding="utf-8") for path in files)
    if "migrations_legacy" in active_text.lower():
        fail("active migration references migrations_legacy")

    known_relations: set[tuple[str, str]] = set()
    for path in files:
        text = path.read_text(encoding="utf-8")
        for match in CREATE_TABLE_RE.finditer(text):
            schema = (match.group("schema") or "public").lower()
            known_relations.add((schema, match.group("table").lower()))

        for match in POLICY_RE.finditer(text):
            schema = (match.group("schema") or "public").lower()
            table = match.group("table").lower()
            if schema in SYSTEM_SCHEMAS:
                continue
            if (schema, table) not in known_relations:
                fail(
                    f"{path.name}: policy targets {schema}.{table!r} before an "
                    "active CREATE TABLE for that relation"
                )

    legacy_sql = list(LEGACY.glob("*.sql")) if LEGACY.is_dir() else []
    print(
        "migration-replay-gate: PASS "
        f"({len(files)} active migrations, {len(legacy_sql)} archived SQL files excluded)"
    )

if __name__ == "__main__":
    main()
