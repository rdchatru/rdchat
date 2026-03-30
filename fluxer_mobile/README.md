# RdChat Mobile

This package wraps the existing `fluxer_app` frontend in a Tauri Mobile shell for Android.

## What it does

- Reuses the mobile layout already present in `fluxer_app`
- Serves `fluxer_app/dist` in production builds
- Starts the shared frontend dev server for Android development
- Marks the runtime as `tauri-android` so the app can identify native mobile sessions

## Commands

- `pnpm --filter fluxer_mobile android:init`
- `pnpm --filter fluxer_mobile android:dev`
- `pnpm --filter fluxer_mobile android:build`
- `pnpm --filter fluxer_mobile android:build:debug`
- `pnpm --filter fluxer_mobile android:init:ci`

## Environment

- `FLUXER_CONFIG` must point at the config JSON used to build `fluxer_app`
- `FLUXER_MOBILE_DEV_URL` optionally overrides the Android dev URL
  - Default: `http://10.0.2.2:49427`
- `FLUXER_APP_DEV_HOST` optionally overrides the frontend dev host
  - Default for mobile dev: `0.0.0.0`
- `FLUXER_APP_DEV_PORT` optionally overrides the frontend dev port
  - Default: `49427`

For a physical device, set `FLUXER_MOBILE_DEV_URL` to your machine's LAN address, for example
`http://192.168.1.50:49427`.

## GitHub Actions

The Android CI build is defined in
`.github/workflows/build-mobile-android.yaml`.

For signed release builds, configure these GitHub secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`
