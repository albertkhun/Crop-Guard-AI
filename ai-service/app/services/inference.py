"""Image validation, preprocessing and model loading.

Contract with the trained model: float32 RGB in [0, 1], shape (1, 224, 224, 3).
The model rescales to [-1, 1] internally, so NEVER normalize here.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import Settings

INPUT_SIZE = 224
ALLOWED_FORMATS = {"JPEG", "PNG"}


class ImageValidationError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 400):
        super().__init__(message)
        self.code, self.message, self.http_status = code, message, http_status


# ---------------------------------------------------------------- validation
def validate_and_decode(data: bytes, settings: Settings) -> Image.Image:
    """Validate raw upload bytes and return a fully decoded, EXIF-upright PIL image."""
    if not data:
        raise ImageValidationError("empty_file", "The uploaded file is empty.", 400)
    if len(data) > settings.max_upload_bytes:
        mb = settings.max_upload_bytes / (1024 * 1024)
        raise ImageValidationError("file_too_large", f"Image is larger than {mb:.0f} MB.", 413)
    try:
        img = Image.open(io.BytesIO(data))  # lazy: reads the header only
    except Image.DecompressionBombError:
        raise ImageValidationError("image_too_large", "Image dimensions are too large.", 413)
    except (UnidentifiedImageError, OSError):
        raise ImageValidationError("unsupported_file", "File is not a readable JPEG or PNG image.", 415)
    if img.format not in ALLOWED_FORMATS:
        raise ImageValidationError("unsupported_file", "Only JPEG and PNG images are accepted.", 415)
    w, h = img.size
    if min(w, h) < settings.min_image_side:
        raise ImageValidationError(
            "image_too_small", f"Image is too small ({w}x{h}). Minimum side is {settings.min_image_side}px.", 422)
    if w * h > settings.max_image_pixels:
        raise ImageValidationError("image_too_large", "Image dimensions are too large.", 413)
    try:
        img.load()  # full decode; catches truncated/corrupt files
    except (OSError, SyntaxError, ValueError):
        raise ImageValidationError("corrupt_image", "Image file is corrupt or truncated.", 400)
    return ImageOps.exif_transpose(img)


# ------------------------------------------------------------- preprocessing
def _to_rgb(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return img.convert("RGB")


def preprocess(img: Image.Image, resize_backend: str = "pil") -> np.ndarray:
    """-> float32 array (1, 224, 224, 3), values in [0, 1]. No further normalization."""
    rgb = _to_rgb(img)
    if resize_backend == "tf":
        import tensorflow as tf  # lazy import; matches keras image_dataset_from_directory resizing
        arr = tf.image.resize(np.asarray(rgb, dtype=np.float32), (INPUT_SIZE, INPUT_SIZE),
                              method="bilinear", antialias=False).numpy()
    else:
        arr = np.asarray(rgb.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR), dtype=np.float32)
    arr = np.clip(arr / 255.0, 0.0, 1.0).astype(np.float32)
    return arr[None, ...]


# --------------------------------------------------------------- model files
def load_class_names(path: Path) -> list[str]:
    names = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(names, list) or not names or not all(isinstance(n, str) for n in names):
        raise ValueError(f"{path} must be a non-empty JSON list of strings")
    if len(set(names)) != len(names):
        raise ValueError(f"{path} contains duplicate class names")
    return names


def resolve_model_version(meta_path: Path, model_path: Path) -> str:
    """model_meta.json 'version' if present, else a short SHA-256 of the model file."""
    try:
        v = json.loads(Path(meta_path).read_text(encoding="utf-8")).get("version")
        if v:
            return str(v)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    h = hashlib.sha256()
    with open(model_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256-" + h.hexdigest()[:12]


class ModelLike(Protocol):
    class_names: list[str]
    version: str

    def predict(self, batch: np.ndarray, mock_scenario: str | None = None) -> np.ndarray: ...


class ModelService:
    """Keras model loaded once at startup."""

    def __init__(self, model, class_names: list[str], version: str):
        self.model, self.class_names, self.version = model, class_names, version

    @classmethod
    def load(cls, settings: Settings) -> "ModelService":
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
        import keras  # heavy import, only when the real model is used

        class_names = load_class_names(settings.class_names_path)
        model = keras.saving.load_model(str(settings.model_path), compile=False)
        if tuple(model.input_shape[1:]) != (INPUT_SIZE, INPUT_SIZE, 3):
            raise RuntimeError(f"Unexpected model input shape {model.input_shape}")
        if model.output_shape[-1] != len(class_names):
            raise RuntimeError(
                f"Model outputs {model.output_shape[-1]} classes but class_names.json has {len(class_names)}")
        svc = cls(model, class_names, resolve_model_version(settings.model_meta_path, settings.model_path))
        svc.predict_batch(np.zeros((1, INPUT_SIZE, INPUT_SIZE, 3), dtype=np.float32))  # warm-up
        return svc

    def predict_batch(self, batch: np.ndarray) -> np.ndarray:
        probs = np.asarray(self.model(batch, training=False), dtype=np.float64)
        if not np.all(np.isfinite(probs)):
            raise RuntimeError("Model produced non-finite outputs")
        return probs

    def predict(self, batch: np.ndarray, mock_scenario: str | None = None) -> np.ndarray:
        return self.predict_batch(batch)[0]
