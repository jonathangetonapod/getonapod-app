#!/usr/bin/env python3

import json
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path


ARCH = "linux-x64"
INDEX_URL = "https://nodejs.org/dist/index.json"
TOOLS_DIR = Path(__file__).resolve().parent.parent / ".tools"
INSTALL_DIR = TOOLS_DIR / "node"
TMP_DIR = TOOLS_DIR / "tmp"


def fetch_index():
    with urllib.request.urlopen(INDEX_URL, timeout=30) as response:
        return json.load(response)


def pick_latest_lts(index):
    for release in index:
        if release.get("lts"):
            return release["version"]
    raise RuntimeError("No LTS Node.js release found")


def download(url: str, destination: Path):
    with urllib.request.urlopen(url, timeout=60) as response, destination.open("wb") as target:
        shutil.copyfileobj(response, target)


def install(version: str):
    archive_name = f"node-{version}-{ARCH}.tar.xz"
    url = f"https://nodejs.org/dist/{version}/{archive_name}"

    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=TMP_DIR) as temp_dir:
        temp_path = Path(temp_dir)
        archive_path = temp_path / archive_name
        download(url, archive_path)

        extract_dir = temp_path / "extract"
        extract_dir.mkdir()
        with tarfile.open(archive_path, "r:xz") as tar:
            tar.extractall(extract_dir)

        extracted_root = extract_dir / f"node-{version}-{ARCH}"
        if not extracted_root.exists():
            raise RuntimeError(f"Expected extracted directory {extracted_root} not found")

        if INSTALL_DIR.exists():
            shutil.rmtree(INSTALL_DIR)
        shutil.copytree(extracted_root, INSTALL_DIR)

    version_file = INSTALL_DIR / ".installed-version"
    version_file.write_text(version + "\n", encoding="utf-8")
    print(f"Installed Node.js {version} to {INSTALL_DIR}")


def main():
    index = fetch_index()
    version = pick_latest_lts(index)
    install(version)


if __name__ == "__main__":
    main()
