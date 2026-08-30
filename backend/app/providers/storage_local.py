"""Lokaler Objekt-Storage (Default): Dateien unter STORAGE_LOCAL_PATH.
Schlüssel werden gegen Path-Traversal abgesichert."""
import os
from pathlib import Path

from app.config import get_settings
from app.providers.base import ObjectStorage


class LocalObjectStorage(ObjectStorage):
    name = "local"

    def __init__(self) -> None:
        self.root = Path(get_settings().storage_local_path).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError(f"Unzulässiger Storage-Key: {key}")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)  # atomar

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def public_url(self, key: str) -> str | None:
        base = get_settings().media_public_base_url
        if base:
            return base.rstrip("/") + "/" + key
        return None  # Backend liefert über /api/v1/media/{key} aus
