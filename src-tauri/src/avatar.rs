//! Local avatar import; no paths supplied by the webview and no network access.
use base64::{engine::general_purpose::STANDARD, Engine};
use std::path::Path;
const LIMIT: usize = 512 * 1024;
pub const SLOTS: [&str; 9] = [
    "idle",
    "focused",
    "reasoning",
    "responding",
    "tool",
    "attention",
    "completed",
    "uncertain",
    "unavailable",
];
pub fn valid_slot(slot: &str) -> bool {
    SLOTS.contains(&slot)
}
pub fn slot_path(base: &Path, slot: &str) -> Result<std::path::PathBuf, String> {
    if !valid_slot(slot) {
        return Err("未知的头像状态".into());
    }
    Ok(base.with_file_name(format!("avatar-{slot}.png")))
}
pub fn read_pack(base: &Path) -> Result<std::collections::BTreeMap<String, String>, String> {
    let mut images = std::collections::BTreeMap::new();
    for slot in SLOTS {
        if let Some(image) = read(&slot_path(base, slot)?)? {
            images.insert(slot.into(), image);
        }
    }
    Ok(images)
}
pub fn decode(image: &str) -> Result<Vec<u8>, String> {
    let encoded = image
        .strip_prefix("data:image/png;base64,")
        .ok_or("头像必须是 PNG 图片")?;
    if encoded.len() > LIMIT * 4 / 3 + 8 {
        return Err("头像数据过大".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| "头像数据无效")?;
    validate(&bytes)?;
    Ok(bytes)
}
fn validate(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > LIMIT
        || bytes.len() < 24
        || &bytes[..8] != b"\x89PNG\r\n\x1a\n"
        || &bytes[12..16] != b"IHDR"
    {
        return Err("头像格式无效".into());
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width == 0 || height == 0 || width > 512 || height > 512 {
        return Err("头像尺寸需在 512 像素以内".into());
    }
    let decoded = tauri::image::Image::from_bytes(bytes).map_err(|_| "头像无法解码")?;
    if decoded.width() != width || decoded.height() != height {
        return Err("头像尺寸无效".into());
    }
    Ok(())
}
pub fn read(path: &Path) -> Result<Option<String>, String> {
    match std::fs::metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取本地头像".into()),
        Ok(meta) if meta.len() > LIMIT as u64 => return Err("本地头像过大".into()),
        _ => {}
    }
    let bytes = std::fs::read(path).map_err(|_| "无法读取本地头像")?;
    validate(&bytes)?;
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes)
    )))
}
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let pending = path.with_extension("pending");
    std::fs::write(&pending, bytes).map_err(|_| "无法保存本地头像")?;
    std::fs::rename(&pending, path).map_err(|_| "无法完成头像保存".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_images_use_fixed_local_paths_and_read_as_a_pack() {
        assert!(slot_path(Path::new("/tmp/avatar.png"), "../escape").is_err());
        let root = std::env::temp_dir().join(format!(
            "pulse-avatar-pack-{}-{}",
            std::process::id(),
            crate::data::now()
        ));
        std::fs::create_dir(&root).unwrap();
        let base = root.join("avatar.png");
        assert!(read_pack(&base).unwrap().is_empty());
        let bytes = include_bytes!("../icons/128x128.png");
        write(&slot_path(&base, "reasoning").unwrap(), bytes).unwrap();
        write(&slot_path(&base, "completed").unwrap(), bytes).unwrap();
        let pack = read_pack(&base).unwrap();
        assert_eq!(pack.len(), 2);
        assert_eq!(decode(&pack["reasoning"]).unwrap(), bytes);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn valid_png_roundtrip_and_malformed_rejection() {
        let bytes = include_bytes!("../icons/128x128.png");
        let uri = format!("data:image/png;base64,{}", STANDARD.encode(bytes));
        assert_eq!(decode(&uri).unwrap(), bytes);
        assert!(decode("data:image/jpeg;base64,aGVsbG8=").is_err());
        assert!(decode("data:image/png;base64,!!!").is_err());
        assert!(decode(&format!("data:image/png;base64,{}", "a".repeat(LIMIT * 2))).is_err());
        let mut huge = bytes.to_vec();
        huge[16..20].copy_from_slice(&10000u32.to_be_bytes());
        assert!(validate(&huge).is_err());
        assert!(validate(&bytes[..30]).is_err());
    }
}
