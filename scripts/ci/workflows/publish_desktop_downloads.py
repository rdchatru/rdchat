#!/usr/bin/env python3

from __future__ import annotations

import json
import mimetypes
import os
import pathlib
import secrets
import sys
import urllib.error
import urllib.request
from typing import Final


UPLOAD_ENDPOINT: Final[str] = "/admin/storage/objects/upload"

PLATFORM_FORMATS: Final[dict[str, list[tuple[str, str]]]] = {
    "windows": [("setup", ".exe")],
    "macos": [("dmg", ".dmg"), ("zip", ".zip")],
    "linux": [("appimage", ".AppImage"), ("deb", ".deb"), ("rpm", ".rpm"), ("tar_gz", ".tar.gz")],
}

SIDECAR_SUFFIXES: Final[tuple[str, ...]] = (".sha256", ".blockmap")

ARCH_HINTS: Final[dict[str, dict[str, tuple[str, ...]]]] = {
    "windows": {
        "x64": ("-x64", "_x64"),
        "arm64": ("-arm64", "_arm64"),
    },
    "macos": {
        "x64": ("-x64", "_x64", "-mac-x64"),
        "arm64": ("-arm64", "_arm64", "-mac-arm64"),
    },
    "linux": {
        "x64": ("-x64", "_x64", "-x86_64", "_x86_64", ".x86_64"),
        "arm64": ("-arm64", "_arm64", "-aarch64", "_aarch64", ".aarch64"),
    },
}


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def normalize_base_url(url: str) -> str:
    return url.rstrip("/")


def get_prefix(channel: str, platform: str, arch: str) -> str:
    platform_map = {"windows": "win32", "macos": "darwin", "linux": "linux"}
    try:
        api_platform = platform_map[platform]
    except KeyError as exc:
        raise SystemExit(f"Unsupported platform: {platform}") from exc
    return f"desktop/{channel}/{api_platform}/{arch}/"


def read_sha256(artifact_path: pathlib.Path) -> str | None:
    sha_path = artifact_path.with_name(f"{artifact_path.name}.sha256")
    if not sha_path.exists():
        return None
    raw = sha_path.read_text(encoding="utf-8").strip()
    if not raw:
        return None
    return raw.split()[0]


def matches_arch_hint(path: pathlib.Path, platform: str, arch: str) -> bool:
    hints = ARCH_HINTS.get(platform, {}).get(arch, ())
    if not hints:
        return True

    lower_name = path.name.lower()
    return any(hint in lower_name for hint in hints)


def find_primary_artifacts(staging_dir: pathlib.Path, platform: str, arch: str) -> dict[str, pathlib.Path]:
    expected = PLATFORM_FORMATS.get(platform)
    if expected is None:
        raise SystemExit(f"Unsupported platform: {platform}")

    found: dict[str, pathlib.Path] = {}
    files = [path for path in staging_dir.iterdir() if path.is_file()]

    for format_name, suffix in expected:
        matches = [
            path
            for path in files
            if path.name.endswith(suffix)
            and not any(path.name.endswith(f"{suffix}{sidecar}") for sidecar in SIDECAR_SUFFIXES)
        ]
        arch_matches = [path for path in matches if matches_arch_hint(path, platform, arch)]
        if arch_matches:
            matches = arch_matches

        if len(matches) != 1:
            joined = ", ".join(sorted(path.name for path in matches)) or "none"
            raise SystemExit(
                f"Expected exactly one {format_name} artifact matching *{suffix} in {staging_dir}, found: {joined}"
            )
        found[format_name] = matches[0]

    return found


def build_manifest(
    *,
    channel: str,
    platform: str,
    arch: str,
    version: str,
    pub_date: str,
    artifacts: dict[str, pathlib.Path],
) -> bytes:
    api_platform = {"windows": "win32", "macos": "darwin", "linux": "linux"}[platform]
    files: dict[str, str | dict[str, str]] = {}

    for format_name, path in artifacts.items():
        sha256 = read_sha256(path)
        if sha256:
            files[format_name] = {"filename": path.name, "sha256": sha256}
        else:
            files[format_name] = path.name

    manifest = {
        "channel": channel,
        "platform": api_platform,
        "arch": arch,
        "version": version,
        "pub_date": pub_date,
        "files": files,
    }
    return json.dumps(manifest, indent=2).encode("utf-8")


def build_multipart_body(
    *,
    bucket: str,
    prefix: str,
    files: list[tuple[str, bytes, str]],
) -> tuple[bytes, str]:
    boundary = f"----rdchat-{secrets.token_hex(16)}"
    chunks: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    def add_file(field_name: str, filename: str, content: bytes, content_type: str) -> None:
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
                    f"Content-Type: {content_type}\r\n\r\n"
                ).encode("utf-8"),
                content,
                b"\r\n",
            ]
        )

    add_field("bucket", bucket)
    add_field("prefix", prefix)
    for filename, content, content_type in files:
        add_file("files", filename, content, content_type)

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), boundary


def upload_files(
    *,
    base_url: str,
    token: str,
    bucket: str,
    prefix: str,
    files: list[tuple[str, bytes, str]],
    audit_log_reason: str,
) -> dict:
    body, boundary = build_multipart_body(bucket=bucket, prefix=prefix, files=files)
    request = urllib.request.Request(
        url=f"{normalize_base_url(base_url)}{UPLOAD_ENDPOINT}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
            "X-Audit-Log-Reason": audit_log_reason,
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Upload failed with HTTP {exc.code}: {details}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Upload failed: {exc.reason}") from exc

    try:
        data = json.loads(payload) if payload else {}
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Upload returned invalid JSON: {payload}") from exc

    if data.get("ok") is not True:
        raise SystemExit(f"Upload did not succeed: {payload}")
    return data


def guess_content_type(path: pathlib.Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def main() -> int:
    base_url = require_env("DOWNLOAD_SERVER_URL")
    token = require_env("DOWNLOAD_SERVER_ADMIN_TOKEN")
    bucket = os.environ.get("DOWNLOAD_SERVER_BUCKET", "fluxer-downloads").strip() or "fluxer-downloads"
    channel = require_env("CHANNEL")
    platform = require_env("PLATFORM")
    arch = require_env("ARCH")
    version = require_env("VERSION")
    pub_date = require_env("PUB_DATE")

    staging_dir = pathlib.Path(os.environ.get("UPLOAD_STAGING_DIR", "upload_staging")).resolve()
    if not staging_dir.exists():
        raise SystemExit(f"Upload staging directory does not exist: {staging_dir}")

    prefix = get_prefix(channel, platform, arch)
    artifacts = find_primary_artifacts(staging_dir, platform, arch)

    manifest_bytes = build_manifest(
        channel=channel,
        platform=platform,
        arch=arch,
        version=version,
        pub_date=pub_date,
        artifacts=artifacts,
    )

    payload_files: list[tuple[str, bytes, str]] = []
    for path in sorted(staging_dir.iterdir()):
        if not path.is_file():
            continue
        payload_files.append((path.name, path.read_bytes(), guess_content_type(path)))

    audit_log_reason = f"Desktop {channel} {platform}/{arch} build {version}"

    upload_files(
        base_url=base_url,
        token=token,
        bucket=bucket,
        prefix=prefix,
        files=payload_files,
        audit_log_reason=audit_log_reason,
    )
    upload_files(
        base_url=base_url,
        token=token,
        bucket=bucket,
        prefix=prefix,
        files=[("manifest.json", manifest_bytes, "application/json")],
        audit_log_reason=f"{audit_log_reason} manifest",
    )

    print(
        json.dumps(
            {
                "bucket": bucket,
                "prefix": prefix,
                "uploaded_file_count": len(payload_files),
                "manifest_formats": sorted(artifacts.keys()),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
