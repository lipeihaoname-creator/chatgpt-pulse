use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

// Never resolve empty or relative overrides against a GUI launch directory.
pub fn sessions_root(home: &Path, configured: Option<&OsStr>) -> PathBuf {
    configured
        .map(Path::new)
        .filter(|p| p.is_absolute())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".codex"))
        .join("sessions")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn default_and_invalid_overrides_use_native_home() {
        let home = std::env::temp_dir().join("A user");
        for value in [None, Some(OsStr::new("")), Some(OsStr::new("relative"))] {
            assert_eq!(sessions_root(&home, value), home.join(".codex/sessions"));
        }
    }
    #[test]
    fn absolute_override_keeps_spaces() {
        let home = std::env::temp_dir();
        let custom = home.join("Custom Codex");
        assert_eq!(
            sessions_root(&home, Some(custom.as_os_str())),
            custom.join("sessions")
        );
    }
}
