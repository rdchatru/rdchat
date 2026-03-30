#!/usr/bin/env python3

import json
import os
import pathlib
import shutil
import sys
from datetime import datetime, timezone

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from ci_workflow import EnvArg, parse_step_env_args
from ci_utils import pwsh_step, require_env, run, run_step, write_github_output


PLATFORMS = [
    {"platform": "windows", "arch": "x64", "os": "windows-latest", "electron_arch": "x64"},
    {"platform": "windows", "arch": "arm64", "os": "windows-11-arm", "electron_arch": "arm64"},
    {"platform": "macos", "arch": "x64", "os": "macos-15-intel", "electron_arch": "x64"},
    {"platform": "macos", "arch": "arm64", "os": "macos-15", "electron_arch": "arm64"},
    {"platform": "linux", "arch": "x64", "os": "ubuntu-24.04", "electron_arch": "x64"},
    {"platform": "linux", "arch": "arm64", "os": "ubuntu-24.04-arm", "electron_arch": "arm64"},
]


def parse_bool(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "on"}


def set_metadata_step(channel: str, ref: str) -> None:
    require_env(["GITHUB_RUN_NUMBER"])
    import os

    run_number = os.environ.get("GITHUB_RUN_NUMBER", "")
    version = f"0.0.{run_number}"
    pub_date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    build_channel = "canary" if channel == "canary" else "stable"
    source_ref = ref or ("canary" if channel == "canary" else "main")

    write_github_output(
        {
            "version": version,
            "pub_date": pub_date,
            "channel": channel,
            "build_channel": build_channel,
            "source_ref": source_ref,
        }
    )


def set_matrix_step(flags: dict[str, bool]) -> None:
    filtered: list[dict[str, str]] = []
    for platform in PLATFORMS:
        plat = platform["platform"]
        arch = platform["arch"]
        skip = False
        if plat == "windows":
            skip = flags["skip_windows"] or (
                (arch == "x64" and flags["skip_windows_x64"])
                or (arch == "arm64" and flags["skip_windows_arm64"])
            )
        elif plat == "macos":
            skip = flags["skip_macos"] or (
                (arch == "x64" and flags["skip_macos_x64"])
                or (arch == "arm64" and flags["skip_macos_arm64"])
            )
        elif plat == "linux":
            skip = flags["skip_linux"] or (
                (arch == "x64" and flags["skip_linux_x64"])
                or (arch == "arm64" and flags["skip_linux_arm64"])
            )
        if not skip:
            filtered.append(platform)

    matrix = {"include": filtered}
    write_github_output({"matrix": json.dumps(matrix, separators=(",", ":"))})


def install_dependencies_step() -> None:
    run(["pnpm", "install", "--frozen-lockfile"])


def update_version_step() -> None:
    require_env(["VERSION"])
    run(
        [
            "pnpm",
            "version",
            os.environ["VERSION"],
            "--no-git-tag-version",
            "--allow-same-version",
        ]
    )


def set_build_channel_step() -> None:
    run(["pnpm", "set-channel"])


def build_electron_main_step() -> None:
    run(["pnpm", "build"])


def remove_path(path: pathlib.Path) -> None:
    is_junction = getattr(path, "is_junction", None)
    if path.is_symlink() or (callable(is_junction) and is_junction()):
        path.unlink()
        return

    if path.is_dir():
        shutil.rmtree(path)
        return

    path.unlink()


def prune_macos_only_modules_step() -> None:
    if os.environ.get("PLATFORM") == "macos":
        return

    node_modules_dir = pathlib.Path("node_modules")
    if not node_modules_dir.exists():
        return

    packages = ("node-mac-permissions", "electron-webauthn-mac")
    print(f"Pruning macOS-only runtime modules before {os.environ.get('PLATFORM', 'non-macos')} packaging...")
    for package_name in packages:
        top_level_package = node_modules_dir / package_name
        if top_level_package.exists() or top_level_package.is_symlink():
            remove_path(top_level_package)

        for pnpm_entry in (node_modules_dir / ".pnpm").glob(f"{package_name}@*"):
            remove_path(pnpm_entry)


def electron_builder_step(target: str) -> None:
    require_env(["ELECTRON_ARCH"])
    prune_macos_only_modules_step()
    run(
        [
            "pnpm",
            "exec",
            "electron-builder",
            "--config",
            "electron-builder.config.cjs",
            target,
            f"--{os.environ['ELECTRON_ARCH']}",
        ]
    )


def build_app_macos_step() -> None:
    electron_builder_step("--mac")


def build_app_windows_step() -> None:
    electron_builder_step("--win")


def build_app_linux_step() -> None:
    electron_builder_step("--linux")


def normalise_updater_yaml_step() -> None:
    if os.environ.get("PLATFORM") != "macos" or os.environ.get("ARCH") != "arm64":
        return

    src = pathlib.Path("upload_staging/latest-mac.yml")
    dst = pathlib.Path("upload_staging/latest-mac-arm64.yml")
    if src.exists() and not dst.exists():
        shutil.move(src, dst)


STEPS = {
    "windows_paths": pwsh_step(
        r"""
subst W: "$env:GITHUB_WORKSPACE"
"WORKDIR=W:" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8

New-Item -ItemType Directory -Force "C:\t" | Out-Null
New-Item -ItemType Directory -Force "C:\sq" | Out-Null
New-Item -ItemType Directory -Force "C:\ebcache" | Out-Null
"TEMP=C:\t" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"TMP=C:\t" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"SQUIRREL_TEMP=C:\sq" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"ELECTRON_BUILDER_CACHE=C:\ebcache" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8

New-Item -ItemType Directory -Force "C:\pnpm-store" | Out-Null
"NPM_CONFIG_STORE_DIR=C:\pnpm-store" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"npm_config_store_dir=C:\pnpm-store" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8

"store-dir=C:\pnpm-store" | Set-Content -Path "W:\.npmrc" -Encoding ascii
git config --global core.longpaths true
"""
    ),
    "set_workdir_unix": "echo \"WORKDIR=$GITHUB_WORKSPACE\" >> \"$GITHUB_ENV\"\n",
    "resolve_pnpm_store_windows": pwsh_step(
        r"""
$store = pnpm store path --silent
"PNPM_STORE_PATH=$store" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
New-Item -ItemType Directory -Force $store | Out-Null
"""
    ),
    "resolve_pnpm_store_unix": """
set -euo pipefail
store="$(pnpm store path --silent)"
echo "PNPM_STORE_PATH=$store" >> "$GITHUB_ENV"
mkdir -p "$store"
""",
    "install_setuptools_windows_arm64": pwsh_step(
        r"""
python -m pip install --upgrade pip
python -m pip install "setuptools>=69" wheel
"""
    ),
    "install_setuptools_macos": "brew install python-setuptools\n",
    "install_linux_deps": """
set -euo pipefail
sudo apt-get update
sudo apt-get install -y \
  libx11-dev libxtst-dev libxt-dev libxinerama-dev libxkbcommon-dev libxrandr-dev \
  ruby ruby-dev build-essential rpm \
  libpixman-1-dev libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
sudo gem install --no-document fpm
""",
    "install_dependencies": install_dependencies_step,
    "update_version": update_version_step,
    "set_build_channel": set_build_channel_step,
    "build_electron_main": build_electron_main_step,
    "build_app_macos": build_app_macos_step,
    "verify_bundle_id": """
set -euo pipefail
DIST="dist-electron"
ZIP="$(ls -1 "$DIST"/*"${ELECTRON_ARCH}"*.zip | head -n1)"
tmp="$(mktemp -d)"
ditto -xk "$ZIP" "$tmp"
APP="$(find "$tmp" -maxdepth 2 -name "*.app" -print -quit)"
BID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")

expected="app.fluxer"
if [[ "${BUILD_CHANNEL:-stable}" == "canary" ]]; then expected="app.fluxer.canary"; fi
echo "Bundle id in zip: $BID (expected: $expected)"
test "$BID" = "$expected"
""",
    "build_app_windows": build_app_windows_step,
    "analyse_squirrel_paths": pwsh_step(
        r"""
$primaryDir = if ($env:ARCH -eq "arm64") { "dist-electron/squirrel-windows-arm64" } else { "dist-electron/squirrel-windows" }
$fallbackDir = if ($env:ARCH -eq "arm64") { "dist-electron/squirrel-windows" } else { "dist-electron/squirrel-windows-arm64" }
$dirs = @($primaryDir, $fallbackDir)

$nupkg = $null
foreach ($d in $dirs) {
  if (Test-Path $d) {
    $nupkg = Get-ChildItem -Path "$d/*.nupkg" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nupkg) { break }
  }
}

if (-not $nupkg) {
  throw "No Squirrel nupkg found in: $($dirs -join ', ')"
}

Write-Host "Analyzing Windows installer $($nupkg.FullName)"
$env:NUPKG_PATH = $nupkg.FullName

$lines = @(
  'import os'
  'import zipfile'
  ''
  'path = os.environ["NUPKG_PATH"]'
  'build_ver = os.environ["BUILD_VERSION"]'
  'prefix = os.path.join(os.environ["LOCALAPPDATA"], "fluxer_app", f"app-{build_ver}", "resources", "app.asar.unpacked")'
  'max_len = int(os.environ.get("MAX_WINDOWS_PATH_LEN", "260"))'
  'headroom = int(os.environ.get("PATH_HEADROOM", "10"))'
  'limit = max_len - headroom'
  ''
  'with zipfile.ZipFile(path) as archive:'
  '    entries = []'
  '    for info in archive.infolist():'
  '        normalized = info.filename.lstrip("/\\\\")'
  '        total_len = len(os.path.join(prefix, normalized)) if normalized else len(prefix)'
  '        entries.append((total_len, info.filename))'
  ''
  'if not entries:'
  '    raise SystemExit("nupkg archive contains no entries")'
  ''
  'entries.sort(reverse=True)'
  'print(f"Assumed install prefix: {prefix} ({len(prefix)} chars). Maximum allowed path length: {limit} (total reserve {max_len}, headroom {headroom}).")'
  'print("Top 20 longest archived paths (length includes prefix):")'
  'for length, name in entries[:20]:'
  '    print(f"{length:4d} {name}")'
  ''
  'longest_len, longest_name = entries[0]'
  'if longest_len > limit:'
  '    raise SystemExit(f"Longest path {longest_len} for {longest_name} exceeds limit {limit}")'
  'print(f"Longest archived path {longest_len} is within the limit of {limit}.")'
)

$scriptPath = Join-Path $env:TEMP "nupkg-long-path-check.py"
Set-Content -Path $scriptPath -Value $lines -Encoding utf8
python $scriptPath
"""
    ),
    "build_app_linux": build_app_linux_step,
    "prepare_artifacts_windows": pwsh_step(
        r"""
New-Item -ItemType Directory -Force upload_staging | Out-Null

$dist = Join-Path $env:WORKDIR "fluxer_desktop/dist-electron"
$sqDirName = if ($env:ARCH -eq "arm64") { "squirrel-windows-arm64" } else { "squirrel-windows" }
$sqFallbackName = if ($sqDirName -eq "squirrel-windows") { "squirrel-windows-arm64" } else { "squirrel-windows" }

$sq = Join-Path $dist $sqDirName
$sqFallback = Join-Path $dist $sqFallbackName

$picked = $null
if (Test-Path $sq) { $picked = $sq }
elseif (Test-Path $sqFallback) { $picked = $sqFallback }

if ($picked) {
  Copy-Item -Force -ErrorAction SilentlyContinue "$picked\*.exe" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$picked\*.exe.blockmap" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$picked\RELEASES*" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$picked\*.nupkg" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$picked\*.nupkg.blockmap" "upload_staging\"
}

if (Test-Path $dist) {
  Copy-Item -Force -ErrorAction SilentlyContinue "$dist\*.yml" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$dist\*.zip" "upload_staging\"
  Copy-Item -Force -ErrorAction SilentlyContinue "$dist\*.zip.blockmap" "upload_staging\"
}

if (-not (Get-ChildItem upload_staging -Filter *.exe -ErrorAction SilentlyContinue)) {
  throw "No installer .exe staged. Squirrel outputs were not copied."
}

Get-ChildItem -Force upload_staging | Format-Table -AutoSize
"""
    ),
    "prepare_artifacts_unix": """
set -euo pipefail
mkdir -p upload_staging
DIST="${WORKDIR}/fluxer_desktop/dist-electron"

cp -f "$DIST"/*.dmg upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.zip upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.zip.blockmap upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.yml upload_staging/ 2>/dev/null || true

cp -f "$DIST"/*.AppImage upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.deb upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.rpm upload_staging/ 2>/dev/null || true
cp -f "$DIST"/*.tar.gz upload_staging/ 2>/dev/null || true

ls -la upload_staging/
""",
    "normalise_updater_yaml": normalise_updater_yaml_step,
    "generate_checksums_unix": """
set -euo pipefail
cd upload_staging
for file in *.exe *.dmg *.zip *.AppImage *.deb *.rpm *.tar.gz; do
  [ -f "$file" ] || continue
  sha256sum "$file" | awk '{print $1}' > "${file}.sha256"
  echo "Generated checksum for $file"
done
ls -la *.sha256 2>/dev/null || echo "No checksum files generated"
""",
    "generate_checksums_windows": pwsh_step(
        r"""
cd upload_staging
$extensions = @('.exe', '.nupkg')
Get-ChildItem -File | Where-Object { $extensions -contains $_.Extension } | ForEach-Object {
  $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
  Set-Content -Path "$($_.FullName).sha256" -Value $hash -NoNewline
  Write-Host "Generated checksum for $($_.Name)"
}
Get-ChildItem -Filter "*.sha256" -ErrorAction SilentlyContinue | Format-Table -AutoSize
"""
    ),
}


SKIP_FLAG_ENV_MAP = {
    "skip_windows": "SKIP_WINDOWS",
    "skip_windows_x64": "SKIP_WINDOWS_X64",
    "skip_windows_arm64": "SKIP_WINDOWS_ARM64",
    "skip_macos": "SKIP_MACOS",
    "skip_macos_x64": "SKIP_MACOS_X64",
    "skip_macos_arm64": "SKIP_MACOS_ARM64",
    "skip_linux": "SKIP_LINUX",
    "skip_linux_x64": "SKIP_LINUX_X64",
    "skip_linux_arm64": "SKIP_LINUX_ARM64",
}

ENV_ARGS = [
    EnvArg("--channel", "CHANNEL"),
    EnvArg("--ref", "REF"),
    EnvArg("--skip-windows", "SKIP_WINDOWS"),
    EnvArg("--skip-windows-x64", "SKIP_WINDOWS_X64"),
    EnvArg("--skip-windows-arm64", "SKIP_WINDOWS_ARM64"),
    EnvArg("--skip-macos", "SKIP_MACOS"),
    EnvArg("--skip-macos-x64", "SKIP_MACOS_X64"),
    EnvArg("--skip-macos-arm64", "SKIP_MACOS_ARM64"),
    EnvArg("--skip-linux", "SKIP_LINUX"),
    EnvArg("--skip-linux-x64", "SKIP_LINUX_X64"),
    EnvArg("--skip-linux-arm64", "SKIP_LINUX_ARM64"),
]


def main() -> int:
    args = parse_step_env_args(ENV_ARGS)

    if args.step == "set_metadata":
        channel = os.environ.get("CHANNEL", "") or "stable"
        set_metadata_step(channel, os.environ.get("REF", ""))
        return 0

    if args.step == "set_matrix":
        flags = {
            key: parse_bool(os.environ.get(env_name, "false"))
            for key, env_name in SKIP_FLAG_ENV_MAP.items()
        }
        set_matrix_step(flags)
        return 0

    run_step(STEPS, args.step)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
