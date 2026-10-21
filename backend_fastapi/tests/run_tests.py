#!/usr/bin/env python
"""Test runner for the hybrid engine."""
import sys
import os

# Add the backend_fastapi directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

# Run the tests
import pytest

if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__.replace("run_tests.py", "test_hybrid_engine.py")]))