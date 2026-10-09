use gba_sprite_prep::run_sprite_batch;
use image::{Rgba, RgbaImage};
use serde_json::json;

#[test]
fn batch_continues_after_errors_and_imports_only_approved_assets() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-batch-{nonce}"));
    let output = root.join("output");
    std::fs::create_dir_all(root.join("Assets")).unwrap();
    RgbaImage::from_pixel(16, 16, Rgba([32, 96, 160, 255]))
        .save(root.join("source.png"))
        .unwrap();
    std::fs::write(
        root.join("game.gba-project"),
        serde_json::to_vec_pretty(&json!({
            "data": {
                "assets": [],
                "animations": [],
                "actors": [{ "id": "actor-player", "name": "Player" }]
            }
        }))
        .unwrap(),
    )
    .unwrap();
    for (file, name, source) in [
        ("approved.json", "approved-item", "source.png"),
        ("draft.json", "draft-item", "source.png"),
        ("broken.json", "broken-item", "missing.png"),
    ] {
        std::fs::write(
            root.join(file),
            format!(
                r#"{{
                  "schemaVersion": 1,
                  "name": "{name}",
                  "source": "{source}",
                  "preset": "item",
                  "animations": [
                    {{ "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] }}
                  ]
                }}"#
            ),
        )
        .unwrap();
    }
    let batch_path = root.join("batch.json");
    std::fs::write(
        &batch_path,
        r#"{
          "schemaVersion": 1,
          "snap": false,
          "previewScale": 2,
          "assets": [
            { "manifest": "approved.json", "approved": true, "project": "game.gba-project", "actor": "actor-player" },
            { "manifest": "draft.json", "approved": false, "project": "game.gba-project", "actor": "actor-player" },
            { "manifest": "broken.json", "approved": true }
          ]
        }"#,
    )
    .unwrap();

    let report = run_sprite_batch(&batch_path, &output).expect("batch report");

    assert_eq!(report.succeeded, 2);
    assert_eq!(report.failed, 1);
    assert_eq!(report.imported, 1);
    assert!(output.join("approved-item/approved-item.png").is_file());
    assert!(output
        .join("approved-item/project/game.gba-project")
        .is_file());
    assert!(!output.join("draft-item/project/game.gba-project").exists());
    assert!(output.join("draft-item/inspector/inspector.json").is_file());
    let inspector: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("draft-item/inspector/inspector.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(inspector["hardware"]["sceneObjects"]["value"], 24);
    assert!(output.join("batch-report.json").is_file());
    assert!(output.join("inspector/index.html").is_file());
    assert!(output.join("inspector/batch-inspector.json").is_file());
    let batch_inspector: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("inspector/batch-inspector.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(batch_inspector["total"], 3);
    assert_eq!(batch_inspector["failed"], 1);
    assert_eq!(batch_inspector["items"][0]["animationCount"], 1);
    assert_eq!(
        batch_inspector["items"][0]["inspector"],
        "../approved-item/inspector/inspector.html"
    );
    assert_eq!(batch_inspector["items"][2]["status"], "error");
    let batch_html = std::fs::read_to_string(output.join("inspector/index.html")).unwrap();
    assert!(batch_html.contains("Inspector do lote"));
    assert!(batch_html.contains("approved-item"));
    assert!(batch_html.contains("broken-item"));
    assert!(batch_html.contains("../approved-item/inspector/inspector.html"));
    assert!(report.items[2]
        .error
        .as_deref()
        .unwrap()
        .contains("missing.png"));

    let overwrite = run_sprite_batch(&batch_path, &output).expect_err("must not overwrite");
    assert!(overwrite.to_string().contains("empty"));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn batch_carries_v2_automatic_mappings_into_both_inspectors() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-batch-v2-{nonce}"));
    let output = root.join("output");
    std::fs::create_dir_all(&root).unwrap();
    let mut source = RgbaImage::new(32, 32);
    for row in 0..2u32 {
        for column in 0..2u32 {
            for y in (row * 16)..((row + 1) * 16) {
                for x in (column * 16)..((column + 1) * 16) {
                    source.put_pixel(
                        x,
                        y,
                        Rgba([48 + row as u8 * 48, 64 + column as u8 * 48, 160, 255]),
                    );
                }
            }
        }
    }
    source.save(root.join("hero.png")).unwrap();
    std::fs::write(
        root.join("hero.pack.json"),
        r#"{
          "schemaVersion": 2,
          "name": "hero-v2",
          "source": "hero.png",
          "profile": "topdown",
          "layout": { "mode": "auto" },
          "animationGrid": {
            "directions": ["down", "up"],
            "states": [
              { "state": "idle", "frameCount": 1, "fps": 8 },
              { "state": "walk", "frameCount": 1, "fps": 12 }
            ]
          }
        }"#,
    )
    .unwrap();
    let batch_path = root.join("batch.json");
    std::fs::write(
        &batch_path,
        r#"{
          "schemaVersion": 1,
          "snap": false,
          "previewScale": 2,
          "assets": [{ "manifest": "hero.pack.json", "approved": false }]
        }"#,
    )
    .unwrap();

    let report = run_sprite_batch(&batch_path, &output).expect("v2 batch");

    assert_eq!(report.succeeded, 1);
    let metadata: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("hero-v2/hero-v2.sprite-pack.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(metadata["schemaVersion"], 2);
    assert_eq!(metadata["animations"].as_array().unwrap().len(), 4);
    assert_eq!(
        metadata["animations"][0]["frames"][0]["sourceFrameIndex"],
        0
    );
    assert_eq!(
        metadata["animations"][3]["frames"][0]["sourceFrameIndex"],
        3
    );
    let inspector: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("hero-v2/inspector/inspector.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(inspector["animations"].as_array().unwrap().len(), 4);
    let batch_inspector: serde_json::Value = serde_json::from_slice(
        &std::fs::read(output.join("inspector/batch-inspector.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(batch_inspector["items"][0]["animationCount"], 4);
    assert_eq!(batch_inspector["items"][0]["frameCount"], 4);
    std::fs::remove_dir_all(root).unwrap();
}
