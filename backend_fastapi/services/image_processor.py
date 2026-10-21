"""
Image Preprocessing and Validation Service.

Handles image validation, preprocessing for OCR readability, and quality checking.
Supports JPG, JPEG, PNG, WEBP formats with comprehensive error handling.

Pipeline:
  1. Validate file type and size
  2. Check image dimensions
  3. Preprocess (contrast, orientation, noise reduction)
  4. Return processed bytes and quality metrics
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional, Tuple

try:
    from PIL import Image, ImageEnhance, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


@dataclass(frozen=True)
class ImageValidationResult:
    """Result of image validation and preprocessing."""
    valid: bool
    error: Optional[str] = None
    processed_bytes: Optional[bytes] = None
    quality_score: float = 0.0  # 0-100
    original_size: Optional[Tuple[int, int]] = None
    format: Optional[str] = None


ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "JPG"}
MIN_IMAGE_DIMENSION = 50
MAX_IMAGE_DIMENSION = 8000
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def validate_and_process_image(image_bytes: bytes, filename: str = "") -> ImageValidationResult:
    """
    Validate and preprocess an image for OCR.

    Returns ImageValidationResult with processed bytes if valid,
    or error message if invalid.
    """
    if not PIL_AVAILABLE:
        return ImageValidationResult(
            valid=False,
            error="Image processing library not available. Install Pillow.",
        )

    if not image_bytes:
        return ImageValidationResult(
            valid=False,
            error="Please upload a screenshot.",
        )

    if len(image_bytes) > MAX_IMAGE_BYTES:
        return ImageValidationResult(
            valid=False,
            error="File is too large. Maximum size is 5 MB.",
        )

    # Try to open and validate the image
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        return ImageValidationResult(
            valid=False,
            error="Unable to read the uploaded file. Please upload a valid JPG, PNG, or WEBP image.",
        )

    # Check format
    image_format = image.format.upper() if image.format else "UNKNOWN"
    if image_format not in ALLOWED_FORMATS:
        return ImageValidationResult(
            valid=False,
            error=f"Unsupported file format: {image_format}. Please upload JPG, PNG, or WEBP.",
        )

    # Check dimensions
    width, height = image.size
    if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
        return ImageValidationResult(
            valid=False,
            error="Image is too small. Please upload a clearer, larger screenshot.",
        )

    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        return ImageValidationResult(
            valid=False,
            error="Image dimensions are too large. Please upload a screenshot with smaller dimensions.",
        )

    # Preprocess the image for OCR
    try:
        processed_image, quality_score = _preprocess_for_ocr(image)

        # Convert to PNG for consistency
        output_bytes = io.BytesIO()
        processed_image.save(output_bytes, format="PNG")
        processed_bytes = output_bytes.getvalue()

        return ImageValidationResult(
            valid=True,
            processed_bytes=processed_bytes,
            quality_score=quality_score,
            original_size=(width, height),
            format=image_format,
        )
    except Exception as e:
        return ImageValidationResult(
            valid=False,
            error=f"Error processing image: {str(e)}",
        )


def _preprocess_for_ocr(image: Image.Image) -> Tuple[Image.Image, float]:
    """
    Preprocess image to improve OCR readability.

    Returns (processed_image, quality_score) where quality_score is 0-100.
    """
    quality_score = 50.0  # Start at neutral

    # Convert to RGB if needed (RGBA, grayscale, etc.)
    if image.mode != "RGB":
        if image.mode == "RGBA":
            # Paste onto white background to remove transparency
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3] if len(image.split()) == 4 else None)
            image = background
        else:
            image = image.convert("RGB")
        quality_score += 5  # Small bonus for conversion

    # Fix orientation based on EXIF if available
    try:
        image = ImageOps.exif_transpose(image)
        quality_score += 3
    except Exception:
        pass  # EXIF data not available

    # Enhance contrast to make text more readable
    try:
        enhancer = ImageEnhance.Contrast(image)
        # Slightly increase contrast (1.0 = original, 1.2 = 20% increase)
        image = enhancer.enhance(1.2)
        quality_score += 5
    except Exception:
        pass

    # Enhance sharpness for text clarity
    try:
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.3)
        quality_score += 5
    except Exception:
        pass

    # Enhance brightness for dark images
    try:
        enhancer = ImageEnhance.Brightness(image)
        image = enhancer.enhance(1.05)
        quality_score += 3
    except Exception:
        pass

    # Resize if image is very small (upscale to improve OCR)
    width, height = image.size
    if width < 400 or height < 300:
        # Scale up to minimum reasonable size for OCR
        scale = max(400 / width, 300 / height)
        new_size = (int(width * scale), int(height * scale))
        try:
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            quality_score += 5
        except Exception:
            pass

    # Cap quality score at 100
    quality_score = min(100.0, quality_score)

    return image, quality_score
