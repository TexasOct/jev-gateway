"""Check supplier artwork and its full notice in both release archive formats."""

from __future__ import annotations

import hashlib
import json
import sys
import tarfile
import zipfile
from pathlib import Path


def archive_assets(path: Path) -> dict[str, bytes]:
    if path.suffix == ".whl":
        with zipfile.ZipFile(path) as archive:
            return {
                name: archive.read(name)
                for name in archive.namelist()
                if "/static/assets/" in name and name.endswith((".svg", ".js"))
            }
    with tarfile.open(path, "r:gz") as archive:
        assets: dict[str, bytes] = {}
        for member in archive.getmembers():
            if not member.isfile() or "/static/assets/" not in member.name:
                continue
            if member.name.endswith((".svg", ".js")):
                stream = archive.extractfile(member)
                assert stream is not None
                assets[member.name] = stream.read()
        return assets


def main() -> None:
    root = Path(__file__).resolve().parents[4]
    source = root / "frontend/src/features/providers/assets"
    manifest = json.loads((source / "sources.json").read_text())
    expected = manifest["deepseek"]["sha256"]
    assert hashlib.sha256((source / "deepseek.svg").read_bytes()).hexdigest() == expected
    notice = (source / "LICENSE-deepseek.txt").read_text()
    forms = {notice, notice.rstrip(), json.dumps(notice), json.dumps(notice.rstrip())}
    paths = [Path(argument) for argument in sys.argv[1:]]
    assert any(path.suffix == ".whl" for path in paths), "Wheel argument required."
    assert any(path.name.endswith(".tar.gz") for path in paths), "Sdist argument required."
    for path in paths:
        assets = archive_assets(path)
        artwork = [
            name for name, data in assets.items()
            if name.endswith(".svg") and hashlib.sha256(data).hexdigest() == expected
        ]
        notices = [
            name for name, data in assets.items()
            if name.endswith(".js") and any(form in data.decode() for form in forms)
        ]
        assert artwork, f"Official SVG missing or changed in {path.name}."
        assert notices, f"Full supplier notice missing in {path.name}."
        print(json.dumps({
            "archive": path.name, "artwork": artwork,
            "notice_assets": notices, "sha256": expected,
        }))


if __name__ == "__main__":
    main()
