use image::{Rgba, RgbaImage};
use std::process::Command;

#[test]
fn cli_generates_the_complete_sprite_pack_without_overwriting_the_source() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-pack-cli-test-{nonce}"));
    let output = root.join("output");
    std::fs::create_dir_all(&root).unwrap();
    let source_path = root.join("hero-source.png");
    RgbaImage::from_pixel(64, 16, Rgba([32, 64, 96, 255]))
        .save(&source_path)
        .unwrap();
    let original = std::fs::read(&source_path).unwrap();
    let manifest_path = root.join("sprite-pack.json");
    std::fs::write(
        &manifest_path,
        r#"{
          "schemaVersion": 2,
          "name": "hero",
          "source": "hero-source.png",
          "profile": "topdown",
          "animations": [
            { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "loops": true, "frames": [0] },
            { "name": "walk_down", "state": "walk", "direction": "down", "fps": 12, "loops": true, "frames": [1] },
            { "name": "attack_down", "state": "attack", "direction": "down", "fps": 10, "loops": false, "frames": [2] },
            { "name": "hurt_down", "state": "hurt", "direction": "down", "fps": 6, "loops": false, "frames": [3] }
          ]
        }"#,
    )
    .unwrap();

    let result = Command::new(env!("CARGO_BIN_EXE_gba-sprite-pack"))
        .arg(&manifest_path)
        .arg(&output)
        .arg("--no-snap")
        .output()
        .expect("run gba-sprite-pack");

    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(output.join("hero.png").is_file());
    assert!(output.join("hero.report.json").is_file());
    assert!(output.join("hero.sprite-pack.json").is_file());
    assert!(output.join("hero.preview.png").is_file());
    assert!(output.join("inspector/inspector.html").is_file());
    assert!(output.join("inspector/preview.gif").is_file());
    assert_eq!(std::fs::read(&source_path).unwrap(), original);
    let metadata: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("hero.sprite-pack.json")).unwrap())
            .unwrap();
    assert_eq!(metadata["schemaVersion"], 2);
    assert_eq!(metadata["animations"].as_array().unwrap().len(), 4);
    assert_eq!(metadata["sourceFrames"].as_array().unwrap().len(), 4);
    let report: serde_json::Value =
        serde_json::from_slice(&std::fs::read(output.join("hero.report.json")).unwrap()).unwrap();
    assert_eq!(report["detection"]["strategy"], "manual-horizontal");
    assert_eq!(report["detection"]["confidence"], 1.0);
    std::fs::remove_dir_all(root).unwrap();
}
