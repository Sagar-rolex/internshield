"""Tests for private ImageKit screenshot storage."""

import asyncio
import os
import unittest
from unittest.mock import MagicMock, patch

from backend_fastapi.services import imagekit


class TestImageKitStorage(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "IMAGEKIT_PRIVATE_KEY": "test-private-key",
                "IMAGEKIT_URL_ENDPOINT": "https://ik.imagekit.io/test-account/",
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def _client(self):
        client = MagicMock()
        client.__enter__.return_value = client
        return client

    def test_uploads_as_private_and_returns_asset_identifiers(self):
        client = self._client()
        client.files.upload.return_value.file_id = "file-123"
        client.files.upload.return_value.file_path = "/internshield/screenshots/user/image.png"

        with patch.object(imagekit, "ImageKit", return_value=client):
            stored = asyncio.run(imagekit.upload_screenshot(b"image-bytes", "image.png", "user"))

        self.assertEqual(stored.file_id, "file-123")
        self.assertEqual(stored.file_path, "/internshield/screenshots/user/image.png")
        client.files.upload.assert_called_once_with(
            file=b"image-bytes",
            file_name="image.png",
            folder="/internshield/screenshots/user",
            is_private_file=True,
            use_unique_file_name=True,
        )

    def test_signed_url_uses_configured_endpoint_and_short_expiry(self):
        client = self._client()
        client.helper.build_url.return_value = "https://ik.imagekit.io/signed-image"

        with patch.object(imagekit, "ImageKit", return_value=client):
            url = imagekit.get_signed_url("/internshield/screenshots/user/image.png")

        self.assertEqual(url, "https://ik.imagekit.io/signed-image")
        client.helper.build_url.assert_called_once_with(
            url_endpoint="https://ik.imagekit.io/test-account",
            src="/internshield/screenshots/user/image.png",
            signed=True,
            expires_in=300,
        )

    def test_delete_uses_imagekit_file_id(self):
        client = self._client()

        with patch.object(imagekit, "ImageKit", return_value=client):
            asyncio.run(imagekit.delete_screenshot("file-123"))

        client.files.delete.assert_called_once_with("file-123")

    def test_configuration_requires_private_key_and_url_endpoint(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(imagekit.ImageKitConfigurationError):
                imagekit.ensure_configured()


if __name__ == "__main__":
    unittest.main()
