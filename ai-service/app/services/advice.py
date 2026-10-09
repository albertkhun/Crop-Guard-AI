"""Lookup of display names and advice from data/treatments.json (never hard-coded)."""
from __future__ import annotations

import json
from pathlib import Path

ADVICE_FIELDS = ("severity_guide", "immediate_actions", "organic_options", "preventive",
                 "recovery_timeline", "consult_expert_if", "safety_note")


class AdviceBook:
    def __init__(self, classes: dict[str, dict]):
        self._c = classes

    def display_name(self, key: str) -> str:
        return self._c[key]["display_name"]

    def display_names(self) -> dict[str, str]:
        return {k: v["display_name"] for k, v in self._c.items()}

    def advice(self, key: str) -> dict:
        return dict(self._c[key]["advice"])


def load_advice_book(path: Path, class_names: list[str]) -> AdviceBook:
    """Load and validate: every model class needs a display_name and all advice fields."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    classes = data.get("classes", {})
    missing = [k for k in class_names if k not in classes]
    if missing:
        raise ValueError(f"treatments.json is missing classes: {missing}")
    for k in class_names:
        e = classes[k]
        if not e.get("display_name"):
            raise ValueError(f"treatments.json[{k}] has no display_name")
        absent = [f for f in ADVICE_FIELDS if f not in e.get("advice", {})]
        if absent:
            raise ValueError(f"treatments.json[{k}].advice is missing fields: {absent}")
    return AdviceBook({k: classes[k] for k in class_names})
