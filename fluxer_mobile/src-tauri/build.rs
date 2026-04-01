use std::{
    env, fs,
    path::{Path, PathBuf},
};

fn main() {
    println!("cargo:rerun-if-changed=mobile/android");

    let target_os = env::var("CARGO_CFG_TARGET_OS").ok();
    let is_android = target_os.as_deref() == Some("android");

    if is_android {
        let lib_path = Path::new("mobile").join("android");
        println!("cargo:android_library_path={}", lib_path.display());
    }

    tauri_build::build();

    if is_android {
        if let Some(project_dir) = env::var_os("TAURI_ANDROID_PROJECT_PATH").map(PathBuf::from) {
            link_android_library(project_dir);
        }
    }
}

fn link_android_library(project_dir: PathBuf) {
    let plugin_name = env::var("CARGO_PKG_NAME")
        .unwrap_or_else(|_| "app".to_owned())
        .to_lowercase()
        .replace('_', "-");
    let plugin_path =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("missing manifest dir"))
            .join("mobile/android");

    let settings_path = project_dir.join("tauri.settings.gradle");
    let build_gradle_path = project_dir.join("app").join("tauri.build.gradle.kts");

    append_once(
        &settings_path,
        &format!(
            "include ':{plugin_name}'\nproject(':{plugin_name}').projectDir = new File({:?})\n",
            plugin_path.display().to_string()
        ),
    );
    append_once(
        &build_gradle_path,
        &format!("\n  implementation(project(\":{plugin_name}\"))"),
    );
}

fn append_once(path: &Path, snippet: &str) {
    let existing = fs::read_to_string(path).unwrap_or_default();
    if existing.contains(snippet.trim()) {
        return;
    }

    let updated = if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "tauri.build.gradle.kts")
    {
        if let Some(index) = existing.rfind('}') {
            format!("{}{}{}\n", &existing[..index], snippet, &existing[index..])
        } else {
            format!("{existing}{snippet}\n")
        }
    } else {
        format!("{existing}{snippet}")
    };

    fs::write(path, updated).unwrap_or_else(|error| {
        panic!("failed to update {}: {error}", path.display());
    });
}
