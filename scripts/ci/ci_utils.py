#!/usr/bin/env python3

import os
import shutil
import subprocess
import sys
from typing import Callable, Iterable, Mapping, Sequence

Step = str | Callable[[], None]


EMPTY_OPTIONAL_ENV_KEYS = {
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_ID",
    "APPLE_TEAM_ID",
    "CSC_KEY_PASSWORD",
    "CSC_LINK",
}


def build_command_env(env: Mapping[str, str] | None = None) -> dict[str, str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    pnpm_home = merged_env.get("PNPM_HOME")
    if pnpm_home:
        current_path = merged_env.get("PATH", "")
        path_parts = current_path.split(os.pathsep) if current_path else []
        if pnpm_home not in path_parts:
            merged_env["PATH"] = os.pathsep.join([pnpm_home, *path_parts] if path_parts else [pnpm_home])

    for key in EMPTY_OPTIONAL_ENV_KEYS:
        if merged_env.get(key) == "":
            merged_env.pop(key, None)

    return merged_env


def run(cmd: Sequence[str], *, env: Mapping[str, str] | None = None) -> None:
    merged_env = build_command_env(env)
    executable = shutil.which(cmd[0], path=merged_env.get("PATH"))
    resolved_cmd = [executable or cmd[0], *cmd[1:]]
    subprocess.run(resolved_cmd, check=True, env=merged_env)


def run_bash(script: str, *, env: Mapping[str, str] | None = None) -> None:
    run(["bash", "-lc", script], env=env)


def run_pwsh(script: str, *, env: Mapping[str, str] | None = None) -> None:
    run(["pwsh", "-NoProfile", "-NonInteractive", "-Command", script], env=env)


def require_env(keys: Iterable[str]) -> None:
    missing = [key for key in keys if not os.environ.get(key)]
    if missing:
        joined = ", ".join(missing)
        raise SystemExit(f"Missing required environment variables: {joined}")


def write_github_env(pairs: Mapping[str, str]) -> None:
    path = os.environ.get("GITHUB_ENV")
    if not path:
        raise SystemExit("GITHUB_ENV is not set")
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in pairs.items():
            handle.write(f"{key}={value}\n")


def write_github_output(pairs: Mapping[str, str]) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        raise SystemExit("GITHUB_OUTPUT is not set")
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in pairs.items():
            handle.write(f"{key}={value}\n")


def write_github_summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        raise SystemExit("GITHUB_STEP_SUMMARY is not set")
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(text)


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def main_error(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def run_step(steps: Mapping[str, Step], step: str) -> None:
    selected = steps.get(step)
    if selected is None:
        main_error(f"Unknown step: {step}")
    if isinstance(selected, str):
        run_bash(selected)
        return
    selected()


def pwsh_step(script: str) -> Step:
    return lambda: run_pwsh(script)
