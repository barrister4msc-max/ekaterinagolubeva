#!/usr/bin/env python3
"""Static safety gate for the active Supabase migration path.

This intentionally checks only supabase/migrations. Archived migrations are
never treated as deployable input. The gate is conservative: it fails when a
policy targets a relation that has not appeared in the active SQL seen so far.
It does not rewrite SQL or silently add placeholder tables.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "supabase" / "migrations"
LEGACY = ROOT / "supabase" / "migrations_legacy"

VERSION_RE = re.compile(r"^(\d{14})_[^/]+\.sql$")
CREATE_TABLE_RE = re.compile(
    r"create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?"
    r"(?:(?:public|private|auth)\\.)?([a-zA-Z_][\\w$]*)",
    re.I,
)
POLICY_RE = re.compile(
    r"create\\s+policy\\s+[^;]+?\\s+on\\s+"
    r"(?:(?:public|private|auth)\\.)?([a-zA-Z_][\\w$]*)",
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

    if versions != sorted(versions):
        fail("active migrations are not ordered by version")
    if len(versions) != len(set(versions)):
        fail("duplicate migration version detected")

    legacy_sql = list(LEGACY.glob("*.sql")) if LEGACY.is_dir() else []
    active_text = "\n".join(path.read_text(encoding="utf-8") for path in files)
    if "migrations_legacy" in active_text.lower():
        fail("active migration references migrations_legacy")

    known_relations: set[str] = set()
    for path in files:
        text = path.read_text(encoding="utf-8")
        for name in CREATE_TABLE_RE.findall(text):
            known_relations.add(name.lower())

        for relation in POLICY_RE.findall(text):
            relation = relation.lower()
            if relation not in known_relations:
                fail(
                    f"{path.name}: policy targets {relation!r} before an active "
                    "CREATE TABLE for that relation"
                )

    print(
        "migration-replay-gate: PASS "
        f"({len(files)} active migrations, {len(legacy_sql)} archived SQL files excluded)"
    )

if __name__ == "__main__":
    main()
