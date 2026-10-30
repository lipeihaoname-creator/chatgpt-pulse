fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=native/system_audio.m");
        println!("cargo:rerun-if-changed=native/demo_capture.m");
        cc::Build::new()
            .file("native/system_audio.m")
            .file("native/demo_capture.m")
            .flag("-fobjc-arc")
            .flag("-std=c11")
            .flag("-mmacosx-version-min=13.3")
            .compile("pulse_system_audio");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=AppKit");
        // Rust's -nodefaultlibs omits Clang's availability-check helper used by
        // @available. Link the toolchain's universal compiler runtime explicitly.
        let resource = std::process::Command::new("xcrun")
            .args(["clang", "--print-resource-dir"]).output().expect("Apple clang is required");
        assert!(resource.status.success(), "Cannot locate Apple compiler runtime");
        let resource = String::from_utf8(resource.stdout).expect("Compiler runtime path");
        println!("cargo:rustc-link-search=native={}/lib/darwin", resource.trim());
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
    tauri_build::build()
}
