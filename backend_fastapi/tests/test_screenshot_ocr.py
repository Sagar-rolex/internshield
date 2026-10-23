"""Regression tests for screenshot OCR failures and safe fallbacks."""

import os
import unittest
from unittest.mock import patch

import services.ocr as ocr
from services.ocr import (
    NoReadableTextError,
    OCRProcessingError,
    OCRResult,
    OCRUnavailableError,
    require_readable_text,
)


class TestScreenshotOcr(unittest.TestCase):
    def test_auto_mode_does_not_substitute_demo_text(self):
        with patch.dict(os.environ, {"OCR_BACKEND": "auto"}), patch.object(
            ocr, "_tesseract_usable", return_value=False
        ):
            with self.assertRaises(OCRUnavailableError):
                ocr.get_ocr_backend()

    def test_tesseract_mode_reports_missing_binary(self):
        with patch.dict(os.environ, {"OCR_BACKEND": "tesseract"}), patch.object(
            ocr, "_tesseract_usable", return_value=False
        ):
            with self.assertRaises(OCRUnavailableError):
                ocr.get_ocr_backend()

    def test_explicit_demo_mode_is_not_the_auto_fallback(self):
        with patch.dict(os.environ, {"OCR_BACKEND": "demo"}), patch.object(
            ocr, "_tesseract_usable", return_value=False
        ):
            self.assertEqual(ocr.get_ocr_backend().name, "demo")

    def test_require_readable_text_returns_real_ocr_output(self):
        result = OCRResult(success=True, text="Software engineering internship responsibilities")

        self.assertEqual(
            require_readable_text(result), "Software engineering internship responsibilities"
        )

    def test_require_readable_text_rejects_empty_or_low_quality_results(self):
        result = OCRResult(
            success=False,
            text="",
            error="Could not extract enough text (0 chars, minimum 50 required).",
        )

        with self.assertRaisesRegex(NoReadableTextError, "No readable text found"):
            require_readable_text(result)

    def test_require_readable_text_explains_corrupt_images(self):
        result = OCRResult(success=False, error="Unable to read the uploaded file.")

        with self.assertRaisesRegex(NoReadableTextError, "invalid or corrupted"):
            require_readable_text(result)

    def test_require_readable_text_rejects_success_with_empty_text(self):
        with self.assertRaisesRegex(NoReadableTextError, "No readable text found"):
            require_readable_text(OCRResult(success=True, text="  \n "))

    def test_require_readable_text_classifies_ocr_processing_errors(self):
        result = OCRResult(success=False, error="OCR processing failed: worker error")

        with self.assertRaises(OCRProcessingError):
            require_readable_text(result)
