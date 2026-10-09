#!/usr/bin/env python
"""Per-class accuracy + confusion matrix on a folder of labelled test images.

Layout:  <data_dir>/<class_key>/*.jpg|png        (folder names must match models/class_names.json)

Usage (from ai-service/):
    python scripts/evaluate.py --data-dir /path/to/test
    python scripts/evaluate.py --data-dir /path/to/test --resize tf      # A/B the resize backend
    python scripts/evaluate.py --data-dir /path/to/test --threshold 0.9 --out-dir eval_out

Uses the SAME validation / preprocessing / gate code as the API, so numbers reflect production behaviour.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.services.gate import evaluate_gate  # noqa: E402
from app.services.inference import ImageValidationError, ModelService, preprocess, validate_and_decode  # noqa: E402

EXTS = {".jpg", ".jpeg", ".png"}


def collect(data_dir: Path, class_names: list[str]):
    items, skipped_dirs = [], []
    for d in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        key = d.name.strip().lower().replace(" ", "_").replace("-", "_")
        if key not in class_names:
            skipped_dirs.append(d.name)
            continue
        items += [(f, class_names.index(key)) for f in sorted(d.rglob("*")) if f.suffix.lower() in EXTS]
    return items, skipped_dirs


def confusion(y_true, y_pred, n):
    m = np.zeros((n, n), dtype=int)
    for t, p in zip(y_true, y_pred):
        m[t, p] += 1
    return m


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", required=True, type=Path)
    ap.add_argument("--model", type=Path)
    ap.add_argument("--class-names", type=Path)
    ap.add_argument("--resize", choices=["pil", "tf"], default="pil")
    ap.add_argument("--threshold", type=float, help="override CONFIDENCE_THRESHOLD for the gate report")
    ap.add_argument("--ood-dir", type=Path,
                    help="folder of NON-paddy images (any layout) to measure how many wrongly pass the gate")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--out-dir", type=Path, default=Path("eval_out"))
    a = ap.parse_args()

    base = Settings.from_env()
    kw = {k: v for k, v in dict(model_path=a.model, class_names_path=a.class_names, resize_backend=a.resize,
                                confidence_threshold=a.threshold, internal_key="eval").items() if v is not None}
    s = Settings(**{**{f: getattr(base, f) for f in base.__dataclass_fields__}, **kw})

    svc = ModelService.load(s)
    names = svc.class_names
    items, skipped = collect(a.data_dir, names)
    if not items:
        print("No labelled images found. Expected <data-dir>/<class_key>/*.jpg", file=sys.stderr)
        return 1
    print(f"model={svc.version}  images={len(items)}  resize={s.resize_backend}  threshold={s.confidence_threshold}")
    if skipped:
        print(f"WARNING: ignored folders not in class_names.json: {skipped}")

    y_true, probs, bad = [], [], []
    batch, labels = [], []

    def flush():
        if batch:
            probs.extend(svc.predict_batch(np.concatenate(batch)))
            y_true.extend(labels)
            batch.clear(); labels.clear()

    for path, label in items:
        try:
            batch.append(preprocess(validate_and_decode(path.read_bytes(), s), s.resize_backend))
            labels.append(label)
        except ImageValidationError as e:
            bad.append((str(path), e.code))
        if len(batch) >= a.batch_size:
            flush()
    flush()
    if bad:
        print(f"WARNING: {len(bad)} unreadable/invalid images skipped, e.g. {bad[:3]}")

    P = np.array(probs); y = np.array(y_true); pred = P.argmax(1)
    n = len(names)
    cm = confusion(y, pred, n)
    support, tp = cm.sum(1), np.diag(cm)
    pred_tot = cm.sum(0)
    recall = np.divide(tp, support, out=np.zeros(n), where=support > 0)
    prec = np.divide(tp, pred_tot, out=np.zeros(n), where=pred_tot > 0)
    f1 = np.divide(2 * prec * recall, prec + recall, out=np.zeros(n), where=(prec + recall) > 0)

    print(f"\n{'class':28s}{'n':>6s}{'acc(recall)':>13s}{'precision':>11s}{'f1':>7s}")
    for i, k in enumerate(names):
        print(f"{k:28s}{support[i]:6d}{recall[i]:13.3f}{prec[i]:11.3f}{f1[i]:7.3f}")
    present = support > 0
    print(f"\noverall accuracy : {tp.sum() / cm.sum():.3f}   macro-F1 (classes with data): {f1[present].mean():.3f}")

    print("\nconfusion matrix (rows = true, cols = predicted):")
    short = [k[:6] for k in names]
    print(" " * 28 + "".join(f"{x:>8s}" for x in short))
    for i, k in enumerate(names):
        print(f"{k:28s}" + "".join(f"{v:8d}" for v in cm[i]))

    off = [(cm[i, j], names[i], names[j]) for i in range(n) for j in range(n) if i != j and cm[i, j] > 0]
    print("\ntop confusions:")
    for c, t, p in sorted(off, reverse=True)[:5]:
        print(f"  {c:4d}  {t} -> {p}")

    # gate behaviour: what the user would actually experience
    gates = [evaluate_gate(p, threshold=s.confidence_threshold, unclear_min_max_prob=s.unclear_min_max_prob,
                           unclear_max_norm_entropy=s.unclear_max_norm_entropy).status for p in P]
    gates = np.array(gates)
    ok = gates == "ok"
    print(f"\ngate @ threshold {s.confidence_threshold}:")
    for st in ("ok", "low_confidence", "unclear_image"):
        print(f"  {st:15s}{(gates == st).sum():6d}  ({(gates == st).mean():.1%})")
    if ok.any():
        print(f"  accuracy on 'ok' answers (selective accuracy): {(pred[ok] == y[ok]).mean():.3f}")
    if (~ok).any():
        print(f"  accuracy on gated-out images (would have been): {(pred[~ok] == y[~ok]).mean():.3f}")
    print("  (suggestion: if selective accuracy is far below 0.85, raise the threshold; "
          "if coverage is very low, check calibration)")

    if a.ood_dir:
        ood = [f for f in sorted(a.ood_dir.rglob("*")) if f.suffix.lower() in EXTS]
        op = []
        for f in ood:
            try:
                op.append(svc.predict_batch(preprocess(validate_and_decode(f.read_bytes(), s), s.resize_backend))[0])
            except ImageValidationError:
                pass
        if op:
            og = np.array([evaluate_gate(p, threshold=s.confidence_threshold, unclear_min_max_prob=s.unclear_min_max_prob,
                                         unclear_max_norm_entropy=s.unclear_max_norm_entropy).status for p in op])
            print(f"\nnon-paddy images ({len(op)}) -- ideal: all 'unclear_image' or 'low_confidence':")
            for st in ("ok", "low_confidence", "unclear_image"):
                print(f"  {st:15s}{(og == st).sum():6d}  ({(og == st).mean():.1%})")
            print(f"  FALSE-ACCEPT rate (non-paddy answered as 'ok'): {(og == 'ok').mean():.1%}")

    a.out_dir.mkdir(parents=True, exist_ok=True)
    with open(a.out_dir / "confusion_matrix.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["true\\pred", *names])
        for i, k in enumerate(names):
            w.writerow([k, *cm[i].tolist()])
    with open(a.out_dir / "per_class.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["class", "n", "recall", "precision", "f1"])
        for i, k in enumerate(names):
            w.writerow([k, int(support[i]), f"{recall[i]:.4f}", f"{prec[i]:.4f}", f"{f1[i]:.4f}"])
    print(f"\nwrote {a.out_dir}/confusion_matrix.csv and per_class.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
