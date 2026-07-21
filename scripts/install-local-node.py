#!/usr/bin/env python3

import hashlib
import hmac
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path


ARCH = "linux-x64"
VERSION = "v22.22.2"
NPM_VERSION = "10.9.7"
ARCHIVE_SHA256 = "88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a"
TOOLS_DIR = Path(__file__).resolve().parent.parent / ".tools"
INSTALL_DIR = TOOLS_DIR / "node"
TMP_DIR = TOOLS_DIR / "tmp"


def download(url: str, destination: Path):
    with urllib.request.urlopen(url, timeout=60) as response, destination.open("wb") as target:
        shutil.copyfileobj(response, target)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def install():
    archive_name = f"node-{VERSION}-{ARCH}.tar.xz"
    url = f"https://nodejs.org/dist/{VERSION}/{archive_name}"

    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=TMP_DIR) as temp_dir:
        temp_path = Path(temp_dir)
        archive_path = temp_path / archive_name
        download(url, archive_path)
        actual_sha256 = sha256_file(archive_path)
        if not hmac.compare_digest(actual_sha256, ARCHIVE_SHA256):
            raise RuntimeError("Downloaded Node.js archive checksum did not match the pinned release")

        extract_dir = temp_path / "extract"
        extract_dir.mkdir()
        with tarfile.open(archive_path, "r:xz") as tar:
            tar.extractall(extract_dir, filter="data")

        extracted_root = extract_dir / f"node-{VERSION}-{ARCH}"
        if not extracted_root.exists():
            raise RuntimeError(f"Expected extracted directory {extracted_root} not found")

        if INSTALL_DIR.exists():
            shutil.rmtree(INSTALL_DIR)
        shutil.copytree(extracted_root, INSTALL_DIR)

    installed_node_version = subprocess.check_output(
        [INSTALL_DIR / "bin" / "node", "--version"], text=True
    ).strip()
    installed_npm_version = subprocess.check_output(
        [
            INSTALL_DIR / "bin" / "node",
            INSTALL_DIR / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
            "--version",
        ],
        text=True,
    ).strip()
    if installed_node_version != VERSION or installed_npm_version != NPM_VERSION:
        raise RuntimeError("Installed Node.js/npm versions did not match the pinned toolchain")

    version_file = INSTALL_DIR / ".installed-version"
    version_file.write_text(f"{VERSION}\nnpm {NPM_VERSION}\n", encoding="utf-8")
    print(f"Installed Node.js {VERSION} with npm {NPM_VERSION} to {INSTALL_DIR}")


def main():
    install()


if __name__ == "__main__":
    main()
