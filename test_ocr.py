"""
Quick OCR test script to diagnose issues.
"""
import os
os.environ['OCR_BACKEND'] = 'demo'

from backend_fastapi.services.ocr import get_ocr_backend

# Create some fake image bytes
fake_image = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100

print("Testing OCR backend...")
print(f"OCR_BACKEND env: {os.getenv('OCR_BACKEND')}")

backend = get_ocr_backend()
print(f"Backend type: {backend.name}")

try:
    result = backend.extract_text(fake_image, "test.png")
    print(f"\nOCR Result:")
    print(f"  Success: {result.success}")
    print(f"  Text length: {len(result.text) if result.text else 0}")
    print(f"  Confidence: {result.confidence}")
    print(f"  Error: {result.error}")
    if result.success:
        print(f"\nExtracted text preview:")
        print(result.text[:200])
except Exception as e:
    print(f"\nERROR: {e}")
    import traceback
    traceback.print_exc()
