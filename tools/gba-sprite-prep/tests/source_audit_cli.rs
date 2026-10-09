use image::{Rgba, RgbaImage};
use std::process::Command;

#[test]
fn cli_reports_a_strict_source_contract_before_packaging() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-audit-cli-test-{nonce}"));
    std::fs::create_dir_all(&root).unwrap();
    let source_path = root.join("nara-flight.png");
    let mut source = RgbaImage::from_pixel(256, 128, Rgba([0, 0, 0, 0]));
    source.put_pixel(24, 24, Rgba([64, 128, 192, 128]));
    source.save(&source_path).unwrap();
    let manifest_path = root.join("sprite-pack.json");
    std::fs::write(
        &manifest_path,
        r#"{
          "schemaVersion": 1,
          "name": "nara-flight",
          "source": "nara-flight.png",
          "profile": "shmup",
          "sourceContract": "gba-native",
          "layout": { "mode": "horizontal", "columns": 2 },
          "animations": [
            { "name": "fly", "state": "walk", "direction": "right", "fps": 8, "frames": [0, 1] }
          ]
        }"#,
    )
    .unwrap();

    let result = Command::new(env!("CARGO_BIN_EXE_gba-sprite-audit"))
        .arg(&manifest_path)
        .output()
        .expect("run gba-sprite-audit");

    assert!(!result.status.success());
    let audit: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(audit["passed"], false);
    assert!(audit["violations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|violation| violation == "partial-alpha"));

    std::fs::remove_dir_all(root).unwrap();
}
