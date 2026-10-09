import io
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from app.config import Settings  # noqa: E402


@pytest.fixture
def settings():
    return Settings(internal_key="test-key", mock_ai=True)


def make_image_bytes(size=(300, 300), color=(40, 160, 60), fmt="JPEG", mode="RGB"):
    buf = io.BytesIO()
    Image.new(mode, size, color if mode == "RGB" else None).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def jpeg_bytes():
    return make_image_bytes()


FIXED_NOW = datetime(2026, 10, 8, 6, 30, tzinfo=timezone.utc)  # 12:00 local at +05:30
