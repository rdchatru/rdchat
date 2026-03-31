fn main() {
    println!("cargo:rerun-if-changed=mobile/android");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        let lib_path = std::path::Path::new("mobile").join("android");
        println!("cargo:android_library_path={}", lib_path.display());
    }
    tauri_build::build()
}
