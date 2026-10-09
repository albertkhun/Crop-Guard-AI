#!/usr/bin/env python
"""Lists every remaining TODO_VERIFY marker in data/*.json so nothing unverified ships by accident."""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


def walk(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")
    elif isinstance(node, str) and "TODO_VERIFY" in node:
        yield path, node


total = 0
for f in sorted(DATA.glob("*.json")):
    hits = list(walk(json.loads(f.read_text(encoding="utf-8"))))
    total += len(hits)
    print(f"{f.name}: {len(hits)} TODO_VERIFY markers")
    if "-v" in sys.argv:
        for p, t in hits:
            print(f"   {p}: {t[:90]}")
print(f"\ntotal: {total}")
sys.exit(1 if total and "--strict" in sys.argv else 0)
