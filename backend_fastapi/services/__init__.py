"""
Evidence-Based Scam Detection Engine Services

This package provides the core services:
- evidence_engine: Structured data extraction + evidence-based rule detection
- ocr: OCR with quality checking and confidence scoring
- image_processor: Image validation and preprocessing
- gemini_service: AI validation of rule findings
- risk_aggregator: Combines evidence + AI validation into final assessment
"""
from .evidence_engine import analyze_with_evidence, EvidenceBasedResult, Signal
from .gemini_service import (
    validate_with_gemini,
    AIValidationOutput,
    GeminiUnavailableError,
    GeminiAnalysisError,
    is_gemini_available,
)
from .risk_aggregator import (
    aggregate_evidence_and_ai,
    HybridAnalysisResult,
    get_scoring_explanation,
)
from .ocr import get_ocr_backend, OCRResult, TesseractBackend, DemoBackend
from .image_processor import validate_and_process_image, ImageValidationResult

__all__ = [
    # Evidence Engine
    "analyze_with_evidence",
    "EvidenceBasedResult",
    "Signal",
    # OCR
    "get_ocr_backend",
    "OCRResult",
    "TesseractBackend",
    "DemoBackend",
    # Image Processor
    "validate_and_process_image",
    "ImageValidationResult",
    # Gemini Service
    "validate_with_gemini",
    "AIValidationOutput",
    "GeminiUnavailableError",
    "GeminiAnalysisError",
    "is_gemini_available",
    # Risk Aggregator
    "aggregate_evidence_and_ai",
    "HybridAnalysisResult",
    "get_scoring_explanation",
]