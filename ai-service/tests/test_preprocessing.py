import io

import numpy as np
import pytest
from PIL import Image

from app.config import Settings
from app.services.inference import ImageValidationError, preprocess, validate_and_decode
from tests.conftest import make_image_bytes

S = Settings(internal_key="k")


def test_shape_dtype_range(jpeg_bytes):
    arr = preprocess(validate_and_decode(jpeg_bytes, S))
    assert arr.shape == (1, 224, 224, 3) and arr.dtype == np.float32
    assert 0.0 <= arr.min() and arr.max() <= 1.0


def test_values_are_zero_one_not_double_normalized():
    white = preprocess(Image.new("RGB", (100, 100), (255, 255, 255)))
    black = preprocess(Image.new("RGB", (100, 100), (0, 0, 0)))
    assert white.min() == pytest.approx(1.0) and black.max() == pytest.approx(0.0)  # not [-1, 1]


def test_channel_order_is_rgb():
    arr = preprocess(Image.new("RGB", (100, 100), (255, 0, 0)))
    assert arr[0, 0, 0, 0] == pytest.approx(1.0) and arr[0, 0, 0, 2] == pytest.approx(0.0)


def test_non_square_is_resized_to_224():
    arr = preprocess(Image.new("RGB", (640, 120), (10, 200, 10)))
    assert arr.shape == (1, 224, 224, 3)


def test_rgba_png_composited_on_white():
    img = Image.new("RGBA", (100, 100), (0, 0, 0, 0))  # fully transparent
    assert preprocess(img).min() == pytest.approx(1.0)


def test_grayscale_and_png_accepted():
    arr = preprocess(validate_and_decode(make_image_bytes(mode="L", fmt="PNG", color=None), S))
    assert arr.shape == (1, 224, 224, 3)


def test_exif_orientation_applied():
    img = Image.new("RGB", (200, 100), (10, 10, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 270 -> becomes portrait
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    assert validate_and_decode(buf.getvalue(), S).size == (100, 200)


@pytest.mark.parametrize("data,code,status", [
    (b"", "empty_file", 400),
    (b"not an image at all", "unsupported_file", 415),
    (make_image_bytes(fmt="GIF"), "unsupported_file", 415),
    (make_image_bytes(size=(32, 500)), "image_too_small", 422),
])
def test_rejections(data, code, status):
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(data, S)
    assert e.value.code == code and e.value.http_status == status


def test_too_large_file():
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(b"\xff" * 2000, Settings(internal_key="k", max_upload_bytes=1000))
    assert e.value.code == "file_too_large" and e.value.http_status == 413


def test_too_many_pixels():
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(make_image_bytes(size=(2000, 2000)), Settings(internal_key="k", max_image_pixels=1_000_000))
    assert e.value.code == "image_too_large"


def test_truncated_jpeg_is_corrupt(jpeg_bytes):
    noisy = Image.effect_noise((400, 400), 80).convert("RGB")
    buf = io.BytesIO()
    noisy.save(buf, format="JPEG")
    data = buf.getvalue()
    with pytest.raises(ImageValidationError) as e:
        validate_and_decode(data[: len(data) // 2], S)
    assert e.value.code == "corrupt_image"
