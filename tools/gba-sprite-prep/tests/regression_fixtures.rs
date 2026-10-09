use gba_sprite_prep::{
    parse_sprite_pack_manifest, prepare_sprite_pack, render_preview_sheet, resolve_profile,
    write_animation_inspector, InspectorOptions,
};
use image::{imageops, Rgba, RgbaImage};
use serde_json::{json, Value};

fn regression_source() -> RgbaImage {
    let mut base = RgbaImage::new(16, 16);
    for y in 2..14 {
        for x in 2..9 {
            base.put_pixel(x, y, Rgba([32, 96, 160, 255]));
        }
    }
    base.put_pixel(9, 3, Rgba([248, 80, 24, 255]));
    let mirrored = imageops::flip_horizontal(&base);
    let mut cut = base.clone();
    for x in 0..16 {
        let color = x as u8;
        cut.put_pixel(
            x,
            0,
            Rgba([
                color.saturating_mul(15),
                240u8.saturating_sub(color.saturating_mul(9)),
                color.saturating_mul(7),
                255,
            ]),
        );
    }
    cut.put_pixel(15, 1, Rgba([248, 80, 24, 96]));

    let mut source = RgbaImage::new(36, 36);
    for (index, frame) in [base.clone(), base, mirrored, cut].iter().enumerate() {
        let x = 1 + (index % 2) as i64 * 18;
        let y = 1 + (index / 2) as i64 * 18;
        imageops::overlay(&mut source, frame, x, y);
    }
    source
}

#[test]
fn matches_the_versioned_ai_regression_contract() {
    let expected_path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/regression/expected.json");
    let expected: Value = serde_json::from_slice(
        &std::fs::read(&expected_path).expect("versioned regression expectation"),
    )
    .expect("valid expected.json");
    let source = regression_source();
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "ai-regression",
          "source": "source.png",
          "profile": "topdown",
          "layout": { "mode": "grid", "rows": 2, "columns": 2, "margin": 1, "spacing": 2 },
          "animations": [
            { "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] },
            { "name": "walk", "state": "walk", "direction": "none", "fps": 10, "frames": [1] },
            { "name": "attack", "state": "attack", "direction": "none", "fps": 12, "loops": false, "frames": [2] },
            { "name": "hurt", "state": "hurt", "direction": "none", "fps": 6, "loops": false, "frames": [3] }
          ]
        }"#,
    )
    .expect("regression manifest");
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared fixture");
    let output = std::env::temp_dir().join(format!(
        "gba-sprite-regression-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&output).unwrap();
    prepared.sheet.save(output.join("sprite.png")).unwrap();
    std::fs::write(
        output.join("sprite.animation.json"),
        serde_json::to_vec_pretty(&prepared.animations).unwrap(),
    )
    .unwrap();
    std::fs::write(
        output.join("sprite.report.json"),
        serde_json::to_vec_pretty(&json!({
            "preparation": prepared.report,
            "detection": prepared.detection,
        }))
        .unwrap(),
    )
    .unwrap();
    let profile = resolve_profile("topdown", None).unwrap();
    render_preview_sheet(&prepared.sheet, &profile, 2)
        .unwrap()
        .save(output.join("sprite.preview.png"))
        .unwrap();
    let inspector = write_animation_inspector(
        &output.join("inspector"),
        &source,
        &manifest,
        &prepared,
        &InspectorOptions::default(),
    )
    .expect("inspector fixture");

    assert_eq!(expected["schemaVersion"], 1);
    assert_eq!(expected["toolVersion"], env!("CARGO_PKG_VERSION"));
    let source_size = expected["case"]["sourceSize"].as_array().unwrap();
    let frame_size = expected["case"]["frameSize"].as_array().unwrap();
    let frame_count = expected["case"]["frameCount"].as_u64().unwrap() as u32;
    assert_eq!(
        source.dimensions(),
        (
            source_size[0].as_u64().unwrap() as u32,
            source_size[1].as_u64().unwrap() as u32,
        )
    );
    assert_eq!(
        prepared.sheet.dimensions(),
        (
            frame_size[0].as_u64().unwrap() as u32 * frame_count,
            frame_size[1].as_u64().unwrap() as u32,
        )
    );
    assert_eq!(prepared.detection.strategy, expected["case"]["layout"]);
    assert_eq!(prepared.detection.rows, 2);
    assert_eq!(prepared.detection.columns, 2);
    assert_eq!(prepared.report.frame_count, frame_count as usize);
    assert!(
        prepared.report.visible_colors
            <= expected["case"]["maxVisibleColors"].as_u64().unwrap() as usize
    );
    assert_eq!(prepared.detection.frames[1].duplicate_of, Some(0));
    assert!(inspector.diagnostics.halo_pixels >= 1);
    assert!(inspector.diagnostics.cut_frames.contains(&3));
    assert!(inspector
        .optimization
        .exact_duplicate_frames
        .iter()
        .any(|pair| pair.frame == 1 && pair.reuses == 0));
    assert!(inspector
        .optimization
        .mirrored_frames
        .iter()
        .any(|pair| pair.frame == 2 && pair.reuses == 0));
    assert!(inspector.optimization.saved_vram_bytes > 0);

    assert!(image::open(output.join("sprite.png")).is_ok());
    assert!(image::open(output.join("sprite.preview.png")).is_ok());
    let serialized_animations: Value =
        serde_json::from_slice(&std::fs::read(output.join("sprite.animation.json")).unwrap())
            .unwrap();
    let serialized_report: Value =
        serde_json::from_slice(&std::fs::read(output.join("sprite.report.json")).unwrap()).unwrap();
    let serialized_inspector: Value =
        serde_json::from_slice(&std::fs::read(output.join("inspector/inspector.json")).unwrap())
            .unwrap();
    assert_eq!(serialized_animations.as_array().unwrap().len(), 4);
    assert_eq!(
        serialized_report["detection"]["frames"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    assert!(
        serialized_inspector["optimization"]["savedVramBytes"]
            .as_u64()
            .unwrap()
            > 0
    );

    for file in expected["case"]["requiredFiles"].as_array().unwrap() {
        assert!(
            output.join(file.as_str().unwrap()).is_file(),
            "missing {file}"
        );
    }
    for size in expected["freeCanvasSizes"].as_array().unwrap() {
        let width = size[0].as_u64().unwrap() as u32;
        let height = size[1].as_u64().unwrap() as u32;
        let free = parse_sprite_pack_manifest(&format!(
            r#"{{
              "schemaVersion": 1,
              "name": "free-{width}x{height}",
              "source": "source.png",
              "profile": "free",
              "width": {width},
              "height": {height},
              "animations": [
                {{ "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] }}
              ]
            }}"#
        ))
        .unwrap();
        let free_source = RgbaImage::from_pixel(width, height, Rgba([32, 96, 160, 255]));
        let free_prepared = prepare_sprite_pack(&free_source, &free, false, None).unwrap();
        assert_eq!(free_prepared.sheet.dimensions(), (width, height));
        assert!((1..=4).contains(&free_prepared.report.hardware_objects_per_frame));
    }
    std::fs::remove_dir_all(output).unwrap();
}
