use gba_sprite_prep::{audit_sprite_source, parse_sprite_pack_manifest, prepare_sprite_pack};
use image::{Rgba, RgbaImage};

fn shmup_manifest() -> gba_sprite_prep::SpritePackManifest {
    parse_sprite_pack_manifest(
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
    .expect("valid strict SHMUP manifest")
}

#[test]
fn accepts_an_integer_scaled_binary_alpha_shmup_sheet() {
    let mut source = RgbaImage::new(256, 128);
    for y in 24..104 {
        for x in 16..112 {
            source.put_pixel(x, y, Rgba([32, 96, 160, 255]));
        }
        for x in 144..240 {
            source.put_pixel(x, y, Rgba([224, 128, 32, 255]));
        }
    }

    let audit = audit_sprite_source(&source, &shmup_manifest()).expect("audit source");

    assert!(audit.passed, "{audit:#?}");
    assert_eq!(audit.integer_scale, Some(4));
    assert_eq!(audit.frame_count, 2);
    assert_eq!(audit.partial_alpha_pixels, 0);
    assert_eq!(audit.visible_colors, 2);
}

#[test]
fn rejects_partial_alpha_before_sprite_preparation() {
    let mut source = RgbaImage::from_pixel(256, 128, Rgba([0, 0, 0, 0]));
    source.put_pixel(32, 32, Rgba([32, 96, 160, 128]));

    let audit = audit_sprite_source(&source, &shmup_manifest()).expect("audit source");

    assert!(!audit.passed);
    assert_eq!(audit.partial_alpha_pixels, 1);
    assert!(audit
        .violations
        .iter()
        .any(|violation| violation == "partial-alpha"));
}

#[test]
fn strict_source_contract_blocks_packing_a_partial_alpha_sheet() {
    let mut source = RgbaImage::from_pixel(256, 128, Rgba([0, 0, 0, 0]));
    source.put_pixel(32, 32, Rgba([32, 96, 160, 128]));

    let error = prepare_sprite_pack(&source, &shmup_manifest(), false, None)
        .expect_err("strict source contract must reject partial alpha");

    assert!(error.to_string().contains("partial-alpha"));
}

#[test]
fn strict_source_contract_preserves_the_authored_frame_canvas() {
    let mut source = RgbaImage::from_pixel(256, 128, Rgba([0, 0, 0, 0]));
    for y in 120..124 {
        for x in 120..124 {
            source.put_pixel(x, y, Rgba([32, 96, 160, 255]));
            source.put_pixel(x + 128, y, Rgba([224, 128, 32, 255]));
        }
    }

    let prepared = prepare_sprite_pack(&source, &shmup_manifest(), false, None)
        .expect("strict source contract prepares an exact nearest copy");

    assert_eq!(prepared.sheet.dimensions(), (64, 32));
    assert_eq!(prepared.sheet.get_pixel(0, 0).0, [0, 0, 0, 0]);
    assert_eq!(prepared.sheet.get_pixel(30, 30).0, [32, 96, 160, 255]);
    assert_eq!(prepared.sheet.get_pixel(62, 30).0, [224, 128, 32, 255]);
}
