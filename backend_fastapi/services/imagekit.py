"""Private ImageKit storage for analyzed screenshots."""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass

from imagekitio import ImageKit, NotFoundError


class ImageKitConfigurationError(RuntimeError):
    pass


class ImageKitServiceError(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredImage:
    file_id: str
    file_path: str


def _settings() -> tuple[str, str]:
    private_key = os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip()
    url_endpoint = os.getenv("IMAGEKIT_URL_ENDPOINT", "").strip().rstrip("/")
    if not private_key or not url_endpoint:
        raise ImageKitConfigurationError(
            "Set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT on the backend."
        )
    return private_key, url_endpoint


def ensure_configured() -> None:
    _settings()


def _upload(image_bytes: bytes, filename: str, user_id: str) -> StoredImage:
    private_key, _ = _settings()
    try:
        with ImageKit(private_key=private_key) as client:
            response = client.files.upload(
                file=image_bytes,
                file_name=filename,
                folder=f"/internshield/screenshots/{user_id}",
                is_private_file=True,
                use_unique_file_name=True,
            )
        if not response.file_id or not response.file_path:
            raise ImageKitServiceError("ImageKit returned an incomplete upload response.")
        return StoredImage(file_id=response.file_id, file_path=response.file_path)
    except ImageKitServiceError:
        raise
    except Exception as exc:
        raise ImageKitServiceError("ImageKit could not store the screenshot.") from exc


async def upload_screenshot(image_bytes: bytes, filename: str, user_id: str) -> StoredImage:
    return await asyncio.to_thread(_upload, image_bytes, filename, user_id)


def _delete(file_id: str) -> None:
    private_key, _ = _settings()
    try:
        with ImageKit(private_key=private_key) as client:
            client.files.delete(file_id)
    except NotFoundError:
        return
    except Exception as exc:
        raise ImageKitServiceError("ImageKit could not delete the screenshot.") from exc


async def delete_screenshot(file_id: str) -> None:
    await asyncio.to_thread(_delete, file_id)


def get_signed_url(file_path: str) -> str:
    private_key, url_endpoint = _settings()
    try:
        with ImageKit(private_key=private_key) as client:
            return client.helper.build_url(
                url_endpoint=url_endpoint,
                src=file_path,
                signed=True,
                expires_in=300,
            )
    except Exception as exc:
        raise ImageKitServiceError("ImageKit could not create a secure image link.") from exc
