"""
Enhanced OCR Service with quality checking and confidence scoring.

Includes image preprocessing, text extraction with confidence metrics,
and minimum threshold validation.
"""
from __future__ import annotations

import io
import os
import re
import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from .image_processor import validate_and_process_image, ImageValidationResult

try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


if TESSERACT_AVAILABLE and not shutil.which("tesseract"):
    # Windows installs Tesseract here by default, but the installer may not
    # update PATH for an already-open terminal or service process.
    tesseract_path = os.path.join(
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        "Tesseract-OCR",
        "tesseract.exe",
    )
    if os.path.isfile(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path


@dataclass(frozen=True)
class OCRResult:
    """Result of OCR text extraction."""
    success: bool
    text: str = ""
    confidence: float = 0.0  # 0-100
    error: Optional[str] = None
    characters_extracted: int = 0
    quality_score: float = 0.0  # From image preprocessing


class OCRUnavailableError(RuntimeError):
    """Raised when real OCR is not installed or cannot be initialized."""


class NoReadableTextError(ValueError):
    """Raised when OCR cannot find enough readable text to analyze safely."""


class OCRProcessingError(RuntimeError):
    """Raised when OCR reports an internal processing error."""


def require_readable_text(result: OCRResult) -> str:
    """Return usable OCR text or fail instead of treating OCR failure as low risk."""
    text = result.text.strip()
    if result.success and text:
        return text

    error = result.error or "No readable text was found in the screenshot."
    if error.startswith("OCR processing failed:"):
        raise OCRProcessingError(error)
    if error.startswith("Unable to read the uploaded file"):
        raise NoReadableTextError(
            "The image file is invalid or corrupted. Upload a valid JPG, PNG, or WEBP image."
        )
    if error.startswith("Unsupported file format:"):
        raise NoReadableTextError("Unsupported image format. Upload a JPG, PNG, or WEBP image.")
    if error.startswith(("Image is too small", "Image dimensions are too large", "File is too large")):
        raise NoReadableTextError(error)
    raise NoReadableTextError(
        "No readable text found. Upload a clearer, higher-resolution screenshot and try again."
    )


MIN_EXTRACTED_CHARS = 50  # Minimum characters for valid OCR result
CONFIDENCE_THRESHOLD = 20.0  # Minimum confidence percentage


class OcrBackend(ABC):
    """Interface for OCR providers."""

    name: str = "base"

    @abstractmethod
    def extract_text(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        """Extract text from image bytes and return OCRResult."""


class TesseractBackend(OcrBackend):
    """Real OCR via pytesseract + Tesseract binary with confidence scoring."""

    name = "tesseract"

    def extract_text(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        # Validate and preprocess image
        validation = validate_and_process_image(image_bytes, filename)
        if not validation.valid:
            return OCRResult(
                success=False,
                error=validation.error,
                quality_score=0.0,
            )

        if not validation.processed_bytes:
            return OCRResult(
                success=False,
                error="Failed to process image.",
                quality_score=validation.quality_score,
            )

        try:
            # Open preprocessed image
            image = Image.open(io.BytesIO(validation.processed_bytes))

            # Extract text with Tesseract
            text = pytesseract.image_to_string(image).strip()

            # Get detailed data including confidence
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

            # Calculate average confidence from Tesseract output
            confidences = [int(conf) for conf in data["conf"] if int(conf) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

            # Normalize to 0-100 range
            avg_confidence = min(100.0, max(0.0, avg_confidence))

            char_count = len(text)

            # Determine if extraction was successful
            if char_count < MIN_EXTRACTED_CHARS:
                return OCRResult(
                    success=False,
                    text=text,
                    confidence=avg_confidence,
                    error=f"Could not extract enough text ({char_count} chars, minimum {MIN_EXTRACTED_CHARS} required). Please upload a clearer screenshot.",
                    characters_extracted=char_count,
                    quality_score=validation.quality_score,
                )

            if avg_confidence < CONFIDENCE_THRESHOLD:
                return OCRResult(
                    success=False,
                    text=text,
                    confidence=avg_confidence,
                    error=f"Image quality too low to analyze reliably (confidence {avg_confidence:.0f}%). Please upload a clearer screenshot.",
                    characters_extracted=char_count,
                    quality_score=validation.quality_score,
                )

            return OCRResult(
                success=True,
                text=text,
                confidence=avg_confidence,
                characters_extracted=char_count,
                quality_score=validation.quality_score,
            )

        except Exception as e:
            return OCRResult(
                success=False,
                error=f"OCR processing failed: {str(e)}",
                quality_score=validation.quality_score,
            )


class DemoBackend(OcrBackend):
    """Demo OCR backend for testing without Tesseract."""

    name = "demo"

    DEMO_TEXT = (
        "URGENT HIRING! Work From Home Data Entry Operator\n"
        "FastCash Hiring Pvt Ltd\n"
        "No experience needed. Earn Rs 80,000 per month from home.\n"
        "Pay a one-time registration fee of Rs 999 to confirm your slot.\n"
        "Limited seats only!\n"
        "Join instantly on WhatsApp. Telegram: FastCashHiring\n"
        "100% guaranteed job offer after the training.\n"
        "Western Union and bank transfer accepted for the processing fee.\n"
    )

    def extract_text(self, image_bytes: bytes, filename: str = "") -> OCRResult:
        # For demo mode, just do basic validation without preprocessing
        if not image_bytes or len(image_bytes) == 0:
            return OCRResult(
                success=False,
                error="No image data provided.",
                quality_score=0.0,
            )

        # Demo mode always succeeds with demo text
        text = os.getenv("OCR_DEMO_TEXT", self.DEMO_TEXT).strip()
        return OCRResult(
            success=True,
            text=text,
            confidence=85.0,  # Demo always has high confidence
            characters_extracted=len(text),
            quality_score=75.0,  # Fixed quality score for demo
        )


def _tesseract_usable() -> bool:
    """Check if Tesseract is available and functional."""
    if not TESSERACT_AVAILABLE:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def get_ocr_backend() -> OcrBackend:
    """Get the configured OCR backend."""
    mode = os.getenv("OCR_BACKEND", "auto").lower()

    if mode == "demo":
        return DemoBackend()

    if mode == "tesseract":
        if _tesseract_usable():
            return TesseractBackend()
        raise OCRUnavailableError("Tesseract OCR is not installed or could not be started.")

    # auto — prefer real OCR when available
    if _tesseract_usable():
        return TesseractBackend()

    raise OCRUnavailableError("Tesseract OCR is not installed or could not be started.")
