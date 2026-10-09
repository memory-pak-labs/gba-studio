use gba_sprite_prep::{
    parse_sprite_pack_manifest, prepare_sprite_pack, write_animation_inspector, InspectorOptions,
};
use image::{Rgba, RgbaImage};

const MANIFEST: &str = r#"{
  "schemaVersion": 1,
  "name": "inspector-hero",
  "source": "hero.png",
  "profile": "topdown",
  "animations": [
    { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "loops": true, "frames": [0] },
    { "name": "walk_down", "state": "walk", "direction": "down", "fps": 12, "loops": true, "frames": [1, 2] },
    { "name": "attack_down", "state": "attack", "direction": "down", "fps": 10, "loops": false, "frames": [3] },
    { "name": "hurt_down", "state": "hurt", "direction": "down", "fps": 6, "loops": false, "frames": [4] }
  ]
}"#;

#[test]
fn writes_the_complete_animation_inspector_artifact_set() {
    let manifest = parse_sprite_pack_manifest(MANIFEST).expect("manifest");
    let mut source = RgbaImage::new(80, 16);
    for frame in 0..5u32 {
        let inset = if frame == 2 { 1 } else { 0 };
        for y in inset..(16 - inset) {
            for x in (frame * 16 + inset)..((frame + 1) * 16 - inset) {
                let alpha = if frame == 3 && x == frame * 16 {
                    96
                } else {
                    255
                };
                source.put_pixel(x, y, Rgba([32 + frame as u8 * 24, 64, 160, alpha]));
            }
        }
    }
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let output = std::env::temp_dir().join(format!("gba-animation-inspector-{nonce}"));

    let report = write_animation_inspector(
        &output,
        &source,
        &manifest,
        &prepared,
        &InspectorOptions {
            scale: 4,
            scene_actor_count: 4,
            collision_width: 16,
            collision_height: 16,
        },
    )
    .expect("inspector");

    assert_eq!(report.animations.len(), 4);
    assert_eq!(report.animations[1].frame_count, 2);
    assert_eq!(report.animations[1].fps, 12);
    assert!(report.hardware.objects_per_frame >= 1);
    assert!(report.diagnostics.halo_pixels >= 1);
    assert!(!report.diagnostics.cut_frames.is_empty());
    for file in [
        "numbered.png",
        "hardware.png",
        "onion-skin.png",
        "before.png",
        "after.png",
        "comparison.png",
        "preview.gif",
        "idle_down.gif",
        "walk_down.gif",
        "attack_down.gif",
        "hurt_down.gif",
        "inspector.json",
        "inspector.html",
    ] {
        assert!(output.join(file).is_file(), "missing {file}");
    }
    assert!(image::open(output.join("numbered.png")).is_ok());
    let numbered = image::open(output.join("numbered.png")).unwrap().to_rgba8();
    let hardware = image::open(output.join("hardware.png")).unwrap().to_rgba8();
    let overlay_colors = [
        [255, 80, 96, 255],
        [72, 196, 255, 255],
        [255, 232, 64, 255],
        [96, 255, 128, 255],
    ];
    for (base, overlay) in numbered.pixels().zip(hardware.pixels()) {
        if base != overlay {
            assert!(
                overlay_colors.contains(&overlay.0),
                "hardware overlay replaced art with {:?}",
                overlay.0
            );
        }
    }
    assert_eq!(
        &std::fs::read(output.join("preview.gif")).unwrap()[0..6],
        b"GIF89a"
    );
    let html = std::fs::read_to_string(output.join("inspector.html")).unwrap();
    assert!(html.contains("type=\"range\""));
    assert!(html.contains("before.png"));
    assert!(html.contains("after.png"));
    assert!(html.contains("VRAM"));
    assert!(html.contains("Scanline"));
    assert!(html.contains("Diagnóstico por animação"));
    assert!(html.contains("Variação de conjunto de cores"));
    assert!(html.contains("walk_down"));
    assert!(html.contains("12 FPS"));
    std::fs::remove_dir_all(output).unwrap();
}

#[test]
fn bottom_center_anchor_does_not_report_ground_contact_as_a_cut() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "grounded-hero",
          "source": "grounded.png",
          "profile": "topdown",
          "animations": [
            { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "loops": true, "frames": [0] }
          ]
        }"#,
    )
    .expect("manifest");
    let mut source = RgbaImage::new(16, 16);
    for y in 1..16 {
        for x in 1..15 {
            source.put_pixel(x, y, Rgba([32, 96, 160, 255]));
        }
    }
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let output = std::env::temp_dir().join(format!("gba-ground-contact-inspector-{nonce}"));

    let report = write_animation_inspector(
        &output,
        &source,
        &manifest,
        &prepared,
        &InspectorOptions {
            scale: 4,
            scene_actor_count: 1,
            collision_width: 16,
            collision_height: 16,
        },
    )
    .expect("inspector");

    assert!(report.diagnostics.cut_frames.is_empty());
    std::fs::remove_dir_all(output).unwrap();
}

#[test]
fn reports_scale_drift_inside_each_animation_instead_of_across_directions() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "directional-scale",
          "source": "directional-scale.png",
          "profile": "topdown",
          "animations": [
            { "name": "walk_down", "state": "walk", "direction": "down", "fps": 8, "loops": true, "frames": [0, 1] },
            { "name": "idle_right", "state": "idle", "direction": "right", "fps": 8, "loops": true, "frames": [2] }
          ]
        }"#,
    )
    .expect("manifest");
    let mut source = RgbaImage::new(48, 16);
    for y in 3..13 {
        for x in 0..16 {
            source.put_pixel(x, y, Rgba([32, 160, 96, 255]));
        }
    }
    for y in 5..11 {
        for x in 16..32 {
            source.put_pixel(x, y, Rgba([32, 160, 96, 255]));
        }
    }
    for y in 1..15 {
        for x in 32..48 {
            source.put_pixel(x, y, Rgba([32, 160, 96, 255]));
        }
    }
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");
    let output = std::env::temp_dir().join(format!(
        "gba-directional-scale-inspector-{}",
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
    .expect("inspector");

    assert_eq!(report.diagnostics.scale_drift_percent, 40.0);
    let walk = report
        .diagnostics
        .animation_diagnostics
        .iter()
        .find(|diagnostic| diagnostic.name == "walk_down")
        .expect("walk diagnostics");
    assert_eq!(walk.scale_drift_percent, 40.0);
    assert_eq!(walk.baseline_drift_pixels, 2);
    std::fs::remove_dir_all(output).unwrap();
}

#[test]
fn reports_palette_set_variation_without_calling_it_hardware_flicker() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "palette-variation",
          "source": "palette-variation.png",
          "profile": "topdown",
          "animations": [
            { "name": "walk_down", "state": "walk", "direction": "down", "fps": 8, "loops": true, "frames": [0, 1] }
          ]
        }"#,
    )
    .expect("manifest");
    let mut source = RgbaImage::new(32, 16);
    for y in 4..12 {
        for x in 1..15 {
            source.put_pixel(x, y, Rgba([32, 160, 96, 255]));
        }
        for x in 17..31 {
            source.put_pixel(x, y, Rgba([32, 160, 96, 255]));
        }
    }
    source.put_pixel(24, 8, Rgba([240, 192, 64, 255]));
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");
    let output = std::env::temp_dir().join(format!(
        "gba-palette-variation-inspector-{}",
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
    .expect("inspector");

    assert!(report.diagnostics.palette_set_variation_frames.contains(&1));
    let walk = &report.diagnostics.animation_diagnostics[0];
    assert!(walk.palette_set_variation_frames.contains(&1));
    std::fs::remove_dir_all(output).unwrap();
}
