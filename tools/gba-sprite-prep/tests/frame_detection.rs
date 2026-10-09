use gba_sprite_prep::{parse_sprite_pack_manifest, prepare_sprite_pack};
use image::{Rgba, RgbaImage};

fn manifest(layout: &str) -> String {
    format!(
        r#"{{
          "schemaVersion": 1,
          "name": "detector",
          "source": "detector.png",
          "profile": "topdown",
          "layout": {layout},
          "animations": [
            {{ "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "frames": [0] }},
            {{ "name": "walk_down", "state": "walk", "direction": "down", "fps": 8, "frames": [1] }},
            {{ "name": "attack_down", "state": "attack", "direction": "down", "fps": 8, "frames": [2] }},
            {{ "name": "hurt_down", "state": "hurt", "direction": "down", "fps": 8, "frames": [3] }}
          ]
        }}"#
    )
}

fn fill(source: &mut RgbaImage, x: u32, y: u32, color: [u8; 4]) {
    for pixel_y in y..(y + 16) {
        for pixel_x in x..(x + 16) {
            source.put_pixel(pixel_x, pixel_y, Rgba(color));
        }
    }
}

#[test]
fn detects_a_manual_grid_with_margin_spacing_empty_and_duplicate_frames() {
    let manifest = parse_sprite_pack_manifest(&manifest(
        r#"{ "mode": "grid", "rows": 2, "columns": 2, "margin": 1, "spacing": 2 }"#,
    ))
    .expect("manifest");
    let mut source = RgbaImage::new(36, 36);
    fill(&mut source, 1, 1, [32, 64, 96, 255]);
    fill(&mut source, 19, 1, [32, 64, 96, 255]);
    fill(&mut source, 1, 19, [160, 64, 32, 255]);

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");

    assert_eq!(prepared.detection.strategy, "manual-grid");
    assert_eq!(prepared.detection.frames.len(), 4);
    assert_eq!(prepared.detection.frames[0].source_x, 1);
    assert_eq!(prepared.detection.frames[0].source_y, 1);
    assert_eq!(prepared.detection.frames[1].source_x, 19);
    assert_eq!(prepared.detection.frames[2].source_y, 19);
    assert_eq!(prepared.detection.frames[1].duplicate_of, Some(0));
    assert!(prepared.detection.frames[3].empty);
    assert_eq!(prepared.sheet.dimensions(), (64, 16));
}

#[test]
fn supports_an_explicit_vertical_layout() {
    let manifest = parse_sprite_pack_manifest(&manifest(
        r#"{ "mode": "vertical", "rows": 4, "columns": 1 }"#,
    ))
    .expect("manifest");
    let mut source = RgbaImage::new(16, 64);
    for index in 0..4 {
        fill(&mut source, 0, index * 16, [index as u8 * 40, 96, 32, 255]);
    }

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");

    assert_eq!(prepared.detection.strategy, "manual-vertical");
    assert_eq!(prepared.detection.frames[2].source_x, 0);
    assert_eq!(prepared.detection.frames[2].source_y, 32);
}

#[test]
fn auto_detects_a_two_dimensional_grid_separated_by_transparency() {
    let manifest =
        parse_sprite_pack_manifest(&manifest(r#"{ "mode": "auto" }"#)).expect("manifest");
    let mut source = RgbaImage::new(34, 34);
    fill(&mut source, 0, 0, [32, 64, 96, 255]);
    fill(&mut source, 18, 0, [64, 96, 32, 255]);
    fill(&mut source, 0, 18, [96, 32, 64, 255]);
    fill(&mut source, 18, 18, [160, 96, 32, 255]);

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");

    assert_eq!(prepared.detection.strategy, "auto-grid");
    assert_eq!(prepared.detection.rows, 2);
    assert_eq!(prepared.detection.columns, 2);
    assert!(prepared.detection.confidence >= 0.9);
    assert_eq!(
        prepared
            .detection
            .frames
            .iter()
            .map(|frame| (frame.source_x, frame.source_y))
            .collect::<Vec<_>>(),
        vec![(0, 0), (18, 0), (0, 18), (18, 18)]
    );
}

#[test]
fn rejects_a_manual_grid_that_does_not_fit_the_image() {
    let manifest = parse_sprite_pack_manifest(&manifest(
        r#"{ "mode": "grid", "rows": 2, "columns": 2, "margin": 3, "spacing": 3 }"#,
    ))
    .expect("manifest");
    let source = RgbaImage::new(32, 32);

    let error = prepare_sprite_pack(&source, &manifest, false, None).expect_err("must fail");
    assert!(error.to_string().contains("layout"));
}

#[test]
fn auto_infers_an_opaque_2d_grid_from_the_v2_animation_contract() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "opaque-grid",
          "source": "opaque-grid.png",
          "profile": "topdown",
          "layout": { "mode": "auto" },
          "animationGrid": {
            "directions": ["down", "left", "right", "up"],
            "states": [
              { "state": "idle", "frameCount": 1, "fps": 8 },
              { "state": "walk", "frameCount": 3, "fps": 12 }
            ]
          }
        }"#,
    )
    .expect("v2 manifest");
    let mut source = RgbaImage::new(64, 64);
    for row in 0..4u32 {
        for column in 0..4u32 {
            fill(
                &mut source,
                column * 16,
                row * 16,
                [32 + row as u8 * 24, 64 + column as u8 * 24, 128, 255],
            );
        }
    }

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");

    assert_eq!(prepared.detection.strategy, "auto-grid-inferred");
    assert_eq!(prepared.detection.rows, 4);
    assert_eq!(prepared.detection.columns, 4);
    assert!(prepared.detection.confidence >= 0.85);
    assert_eq!(prepared.detection.frames[6].row, 1);
    assert_eq!(prepared.detection.frames[6].column, 2);
    assert_eq!(prepared.detection.frames[6].source_x, 32);
    assert_eq!(prepared.detection.frames[6].source_y, 16);
    assert_eq!(
        prepared.animations[1]
            .frames
            .iter()
            .map(|frame| frame.source_frame_index)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(
        prepared.animations[3]
            .frames
            .iter()
            .map(|frame| frame.source_frame_index)
            .collect::<Vec<_>>(),
        vec![5, 6, 7]
    );
}

#[test]
fn v2_semantic_grid_wins_over_misleading_internal_transparent_segments() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "segmented-grid",
          "source": "segmented-grid.png",
          "profile": "topdown",
          "layout": { "mode": "auto" },
          "animationGrid": {
            "directions": ["down", "left", "right", "up"],
            "states": [{ "state": "walk", "frameCount": 4, "fps": 12 }]
          }
        }"#,
    )
    .expect("v2 manifest");
    let mut source = RgbaImage::new(64, 64);
    for band in 0..8u32 {
        let start_x = band * 8 + 1;
        for y in (0..32).chain(33..64) {
            for x in start_x..(start_x + 6) {
                source.put_pixel(x, y, Rgba([64 + band as u8 * 12, 96, 160, 255]));
            }
        }
    }

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared");

    assert_eq!(prepared.detection.strategy, "auto-grid-inferred");
    assert_eq!(prepared.detection.rows, 4);
    assert_eq!(prepared.detection.columns, 4);
    assert_eq!(prepared.detection.frames[6].source_x, 32);
    assert_eq!(prepared.detection.frames[6].source_y, 16);
}
