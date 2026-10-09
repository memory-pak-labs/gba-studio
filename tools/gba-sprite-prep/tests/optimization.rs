use gba_sprite_prep::{
    parse_sprite_pack_manifest, prepare_sprite_pack, write_animation_inspector, InspectorOptions,
};
use image::{imageops, Rgba, RgbaImage};

#[test]
fn reports_exact_and_horizontally_mirrored_frame_savings() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "optimized",
          "source": "source.png",
          "profile": "topdown",
          "animations": [
            { "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] },
            { "name": "walk", "state": "walk", "direction": "none", "fps": 8, "frames": [1] },
            { "name": "attack", "state": "attack", "direction": "none", "fps": 8, "frames": [2] },
            { "name": "hurt", "state": "hurt", "direction": "none", "fps": 8, "frames": [3] }
          ]
        }"#,
    )
    .unwrap();
    let mut base = RgbaImage::new(16, 16);
    for y in 4..14 {
        for x in 2..7 {
            base.put_pixel(x, y, Rgba([32, 96, 160, 255]));
        }
    }
    base.put_pixel(7, 5, Rgba([224, 96, 32, 255]));
    let mirrored = imageops::flip_horizontal(&base);
    let mut unique = base.clone();
    unique.put_pixel(8, 8, Rgba([96, 224, 64, 255]));
    let mut source = RgbaImage::new(64, 16);
    for (index, frame) in [base.clone(), base, mirrored, unique].iter().enumerate() {
        imageops::overlay(&mut source, frame, (index * 16) as i64, 0);
    }
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).unwrap();
    let output = std::env::temp_dir().join(format!(
        "gba-optimization-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));

    let report = write_animation_inspector(
        &output,
        &source,
        &manifest,
        &prepared,
        &InspectorOptions::default(),
    )
    .unwrap();

    assert!(report
        .optimization
        .exact_duplicate_frames
        .iter()
        .any(|pair| pair.frame == 1 && pair.reuses == 0));
    assert!(report
        .optimization
        .mirrored_frames
        .iter()
        .any(|pair| pair.frame == 2 && pair.reuses == 0));
    assert!(report.optimization.optimized_vram_bytes < report.optimization.original_vram_bytes);
    assert!(report.optimization.saved_vram_bytes > 0);
    assert_eq!(
        report.optimization.resource.strategy,
        "exact-structural-reuse-v1"
    );
    assert!(
        report.optimization.resource.unique_tiles_after
            < report.optimization.resource.unique_tiles_before
    );
    assert_eq!(report.optimization.resource.visual_error_pixels, 0);
    assert_eq!(report.optimization.resource.anchor_adjustments, 0);
    std::fs::remove_dir_all(output).unwrap();
}
