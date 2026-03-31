#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from ci_utils import require_env, run_step, write_github_summary
from ci_workflow import EnvArg, parse_step_env_args


@dataclass(frozen=True)
class DesktopFormatDescriptor:
    format_name: str
    extension: str
    arch_suffixes: dict[str, str]


DESKTOP_PLATFORM_PATHS = {
    "windows": "win32",
    "macos": "darwin",
    "linux": "linux",
}


DESKTOP_FORMATS: dict[str, tuple[DesktopFormatDescriptor, ...]] = {
    "win32": (
        DesktopFormatDescriptor(
            format_name="setup",
            extension=".exe",
            arch_suffixes={"x64": "x64", "arm64": "arm64"},
        ),
    ),
    "darwin": (
        DesktopFormatDescriptor(
            format_name="dmg",
            extension=".dmg",
            arch_suffixes={"x64": "x64", "arm64": "arm64"},
        ),
        DesktopFormatDescriptor(
            format_name="zip",
            extension=".zip",
            arch_suffixes={"x64": "x64", "arm64": "arm64"},
        ),
    ),
    "linux": (
        DesktopFormatDescriptor(
            format_name="appimage",
            extension=".AppImage",
            arch_suffixes={"x64": "x86_64", "arm64": "aarch64"},
        ),
        DesktopFormatDescriptor(
            format_name="deb",
            extension=".deb",
            arch_suffixes={"x64": "amd64", "arm64": "arm64"},
        ),
        DesktopFormatDescriptor(
            format_name="rpm",
            extension=".rpm",
            arch_suffixes={"x64": "x86_64", "arm64": "aarch64"},
        ),
        DesktopFormatDescriptor(
            format_name="tar_gz",
            extension=".tar.gz",
            arch_suffixes={"x64": "x64", "arm64": "arm64"},
        ),
    ),
}


ENV_ARGS = [
    EnvArg("--api-base-url", "API_BASE_URL"),
    EnvArg("--admin-api-key", "ADMIN_API_KEY"),
    EnvArg("--bucket", "BUCKET"),
    EnvArg("--artifacts-dir", "ARTIFACTS_DIR"),
    EnvArg("--channel", "CHANNEL"),
    EnvArg("--version", "VERSION"),
    EnvArg("--pub-date", "PUB_DATE"),
    EnvArg("--release-channel", "RELEASE_CHANNEL"),
]


ARTIFACT_DIR_PATTERN = re.compile(r"^fluxer-desktop-(stable|canary)-(windows|macos|linux)-(x64|arm64)$")


def sha256_hex(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_sha256_file(source: pathlib.Path, target: pathlib.Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(sha256_hex(source), encoding="utf-8")


def copy_file(source: pathlib.Path, target: pathlib.Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def replace_text(text: str, replacements: dict[str, str]) -> str:
    updated = text
    for original, replacement in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        updated = updated.replace(original, replacement)
    return updated


def maybe_rewrite_text_file(path: pathlib.Path, replacements: dict[str, str]) -> None:
    if path.suffix.lower() not in {".yml", ".yaml", ".json"} and not path.name.startswith("RELEASES"):
        return

    original = path.read_text(encoding="utf-8")
    updated = replace_text(original, replacements)
    if updated != original:
        path.write_text(updated, encoding="utf-8")


def upload_sort_key(path: pathlib.Path) -> tuple[int, str]:
    name = path.name
    if name == "manifest.json":
        return (3, name)
    if name.endswith((".yml", ".yaml")) or name.startswith("RELEASES"):
        return (2, name)
    return (1, name)


def content_type_for_upload(path: pathlib.Path) -> str:
    if path.name in {"apk", "rdchat.apk"} or path.suffix.lower() == ".apk":
        return "application/vnd.android.package-archive"
    if path.name in {"aab", "rdchat.aab"} or path.suffix.lower() == ".aab":
        return "application/octet-stream"

    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def upload_file(
    *,
    api_base_url: str,
    admin_api_key: str,
    bucket: str,
    prefix: str,
    path: pathlib.Path,
    audit_log_reason: str,
) -> None:
    url = f"{api_base_url.rstrip('/')}/admin/storage/objects/upload"
    command = [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        url,
        "-H",
        f"Authorization: Admin {admin_api_key}",
        "-H",
        f"X-Audit-Log-Reason: {audit_log_reason}",
        "-F",
        f"bucket={bucket}",
        "-F",
        f"prefix={prefix}",
        "-F",
        f"files=@{path};type={content_type_for_upload(path)}",
    ]

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        message = stderr or stdout or f"curl exited with status {result.returncode}"
        raise SystemExit(f"Upload failed for {prefix}{path.name}: {message}")

    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Upload returned invalid JSON for {prefix}{path.name}: {exc}") from exc

    uploaded_keys = payload.get("uploaded_keys", [])
    if not isinstance(uploaded_keys, list) or not uploaded_keys:
        raise SystemExit(f"Upload response for {prefix}{path.name} did not include uploaded_keys")

    print(f"Uploaded {uploaded_keys[0]}")


def build_legacy_filename(
    *,
    channel: str,
    platform: str,
    arch: str,
    descriptor: DesktopFormatDescriptor,
    version: str,
) -> str:
    arch_suffix = descriptor.arch_suffixes[arch]
    if descriptor.format_name == "setup":
        return f"fluxer-{channel}-{version}-{arch_suffix}-setup{descriptor.extension}"
    return f"fluxer-{channel}-{version}-{arch_suffix}{descriptor.extension}"


def is_primary_desktop_file(path: pathlib.Path, descriptor: DesktopFormatDescriptor) -> bool:
    name = path.name
    if descriptor.format_name == "setup":
        return name.endswith(".exe") and not name.endswith(".exe.blockmap")
    if descriptor.format_name == "zip":
        return name.endswith(".zip") and not name.endswith(".zip.blockmap")
    if descriptor.format_name == "tar_gz":
        return name.endswith(".tar.gz")
    return name.endswith(descriptor.extension)


def find_primary_desktop_file(
    files: list[pathlib.Path], descriptor: DesktopFormatDescriptor
) -> pathlib.Path | None:
    candidates = sorted(path for path in files if is_primary_desktop_file(path, descriptor))
    if not candidates:
        return None
    return candidates[0]


def stage_desktop_lane(
    *,
    source_dir: pathlib.Path,
    stage_dir: pathlib.Path,
    channel: str,
    platform: str,
    arch: str,
    version: str,
    pub_date: str,
) -> list[str]:
    files = sorted(path for path in source_dir.iterdir() if path.is_file())
    descriptors = DESKTOP_FORMATS[platform]
    replacements: dict[str, str] = {}
    manifest_files: dict[str, str] = {}
    excluded_source_names: set[str] = set()

    for descriptor in descriptors:
        source_file = find_primary_desktop_file(files, descriptor)
        if source_file is None:
            continue

        target_name = build_legacy_filename(
            channel=channel,
            platform=platform,
            arch=arch,
            descriptor=descriptor,
            version=version,
        )
        target_file = stage_dir / target_name
        copy_file(source_file, target_file)
        manifest_files[descriptor.format_name] = target_name
        replacements[source_file.name] = target_name
        excluded_source_names.add(source_file.name)

        sha256_source = source_dir / f"{source_file.name}.sha256"
        if sha256_source.exists():
            target_sha = stage_dir / f"{target_name}.sha256"
            copy_file(sha256_source, target_sha)
            replacements[sha256_source.name] = target_sha.name
            excluded_source_names.add(sha256_source.name)

        blockmap_source = source_dir / f"{source_file.name}.blockmap"
        if blockmap_source.exists():
            target_blockmap = stage_dir / f"{target_name}.blockmap"
            copy_file(blockmap_source, target_blockmap)
            replacements[blockmap_source.name] = target_blockmap.name
            excluded_source_names.add(blockmap_source.name)

    for source_file in files:
        if source_file.name in excluded_source_names:
            continue

        target_file = stage_dir / source_file.name
        copy_file(source_file, target_file)
        maybe_rewrite_text_file(target_file, replacements)

    manifest_path = stage_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "channel": channel,
                "platform": platform,
                "arch": arch,
                "version": version,
                "pub_date": pub_date,
                "files": manifest_files,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    return sorted(manifest_files.values())


def publish_directory(
    *,
    source_dir: pathlib.Path,
    api_base_url: str,
    admin_api_key: str,
    bucket: str,
    prefix: str,
    audit_log_reason: str,
) -> list[str]:
    uploaded: list[str] = []
    for path in sorted((item for item in source_dir.iterdir() if item.is_file()), key=upload_sort_key):
        upload_file(
            api_base_url=api_base_url,
            admin_api_key=admin_api_key,
            bucket=bucket,
            prefix=prefix,
            path=path,
            audit_log_reason=audit_log_reason,
        )
        uploaded.append(path.name)
    return uploaded


def publish_desktop_step() -> None:
    require_env(["API_BASE_URL", "ADMIN_API_KEY", "BUCKET", "ARTIFACTS_DIR", "CHANNEL", "VERSION", "PUB_DATE"])

    artifacts_dir = pathlib.Path(os.environ["ARTIFACTS_DIR"])
    if not artifacts_dir.exists():
        raise SystemExit(f"Artifacts directory not found: {artifacts_dir}")

    api_base_url = os.environ["API_BASE_URL"]
    admin_api_key = os.environ["ADMIN_API_KEY"]
    bucket = os.environ["BUCKET"]
    requested_channel = os.environ["CHANNEL"]
    version = os.environ["VERSION"]
    pub_date = os.environ["PUB_DATE"]

    artifact_dirs: list[tuple[pathlib.Path, str, str, str]] = []
    for child in sorted(artifacts_dir.iterdir()):
        if not child.is_dir():
            continue
        match = ARTIFACT_DIR_PATTERN.match(child.name)
        if not match:
            continue
        channel, platform_name, arch = match.groups()
        if channel != requested_channel:
            continue
        artifact_dirs.append((child, channel, platform_name, arch))

    if not artifact_dirs:
        raise SystemExit(f"No desktop artifact directories found in {artifacts_dir}")

    published_prefixes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="rdchat-desktop-publish-") as temp_dir:
        temp_root = pathlib.Path(temp_dir)

        for source_dir, channel, platform_name, arch in artifact_dirs:
            platform = DESKTOP_PLATFORM_PATHS[platform_name]
            prefix = f"desktop/{channel}/{platform}/{arch}/"
            stage_dir = temp_root / prefix
            stage_dir.mkdir(parents=True, exist_ok=True)

            primary_files = stage_desktop_lane(
                source_dir=source_dir,
                stage_dir=stage_dir,
                channel=channel,
                platform=platform,
                arch=arch,
                version=version,
                pub_date=pub_date,
            )
            audit_log_reason = f"CI publish desktop {channel} {version} ({platform}/{arch})"
            uploaded_files = publish_directory(
                source_dir=stage_dir,
                api_base_url=api_base_url,
                admin_api_key=admin_api_key,
                bucket=bucket,
                prefix=prefix,
                audit_log_reason=audit_log_reason,
            )
            published_prefixes.append(prefix)
            print(
                f"Published {prefix} with {len(uploaded_files)} files. Primary artifacts: "
                + (", ".join(primary_files) if primary_files else "none")
            )

    if published_prefixes:
        summary_lines = ["## RdChat Desktop Publish", ""]
        for prefix in published_prefixes:
            summary_lines.append(f"- Published `{prefix}`")
        write_github_summary("\n".join(summary_lines) + "\n")


def select_preferred_mobile_artifact(paths: list[pathlib.Path]) -> pathlib.Path | None:
    if not paths:
        return None

    def rank(path: pathlib.Path) -> tuple[int, int, str]:
        name = path.name.lower()
        score = 0
        if "release" not in name:
            score += 100
        if "universal" not in name:
            score += 10
        if "unsigned" in name or "unaligned" in name or "debug" in name:
            score += 1000
        return (score, len(name), name)

    return sorted(paths, key=rank)[0]


def stage_android_alias(source: pathlib.Path, target: pathlib.Path) -> None:
    copy_file(source, target)
    write_sha256_file(target, target.parent / f"{target.name}.sha256")


def publish_android_step() -> None:
    require_env(["API_BASE_URL", "ADMIN_API_KEY", "BUCKET", "ARTIFACTS_DIR", "RELEASE_CHANNEL"])

    artifacts_dir = pathlib.Path(os.environ["ARTIFACTS_DIR"])
    if not artifacts_dir.exists():
        raise SystemExit(f"Artifacts directory not found: {artifacts_dir}")

    apk = select_preferred_mobile_artifact(sorted(artifacts_dir.rglob("*.apk")))
    aab = select_preferred_mobile_artifact(sorted(artifacts_dir.rglob("*.aab")))
    if apk is None and aab is None:
        raise SystemExit(f"No Android release artifacts found in {artifacts_dir}")

    api_base_url = os.environ["API_BASE_URL"]
    admin_api_key = os.environ["ADMIN_API_KEY"]
    bucket = os.environ["BUCKET"]
    release_channel = os.environ["RELEASE_CHANNEL"]

    published_prefixes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="rdchat-android-publish-") as temp_dir:
        temp_root = pathlib.Path(temp_dir)

        archive_stage = temp_root / "archive"
        archive_stage.mkdir(parents=True, exist_ok=True)
        if apk is not None:
            stage_android_alias(apk, archive_stage / apk.name)
        if aab is not None:
            stage_android_alias(aab, archive_stage / aab.name)

        archive_prefix = f"android/{release_channel}/arm64/"
        publish_directory(
            source_dir=archive_stage,
            api_base_url=api_base_url,
            admin_api_key=admin_api_key,
            bucket=bucket,
            prefix=archive_prefix,
            audit_log_reason=f"CI publish Android {release_channel} release archive",
        )
        published_prefixes.append(archive_prefix)

        if release_channel == "stable":
            public_stage = temp_root / "public"
            public_stage.mkdir(parents=True, exist_ok=True)

            if apk is not None:
                stage_android_alias(apk, public_stage / "rdchat.apk")
                stage_android_alias(apk, public_stage / "apk")
            if aab is not None:
                stage_android_alias(aab, public_stage / "rdchat.aab")

            public_prefix = "android/arm64/"
            publish_directory(
                source_dir=public_stage,
                api_base_url=api_base_url,
                admin_api_key=admin_api_key,
                bucket=bucket,
                prefix=public_prefix,
                audit_log_reason="CI publish Android stable public downloads",
            )
            published_prefixes.append(public_prefix)

    summary_lines = ["## RdChat Android Publish", ""]
    for prefix in published_prefixes:
        summary_lines.append(f"- Published `{prefix}`")
    if apk is not None:
        summary_lines.append(f"- APK: `{apk.name}`")
    if aab is not None:
        summary_lines.append(f"- AAB: `{aab.name}`")
    write_github_summary("\n".join(summary_lines) + "\n")


STEPS = {
    "desktop": publish_desktop_step,
    "android": publish_android_step,
}


def main() -> int:
    args = parse_step_env_args(ENV_ARGS)
    run_step(STEPS, args.step)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
