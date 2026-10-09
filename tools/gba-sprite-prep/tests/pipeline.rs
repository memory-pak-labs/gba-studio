use gba_sprite_prep::{
    build_animation_metadata, import_prepared_sprite_into_project, materialize_project_copy,
    prepare_frames, render_preview_sheet, resolve_profile,
    snap_frames_with_spritefusion_for_target, split_horizontal_frames, Anchor, AnimationOptions,
};
use image::{Rgba, RgbaImage};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

fn solid_frame(width: u32, height: u32, color: Rgba<u8>) -> RgbaImage {
    RgbaImage::from_pixel(width, height, color)
}

#[test]
fn resolves_profiles_that_match_the_current_exporter_contract() {
    let topdown = resolve_profile("topdown", None).expect("topdown profile");
    let topdown_tall = resolve_profile("topdown-tall", None).expect("tall topdown profile");
    let platformer = resolve_profile("platformer", None).expect("platformer profile");
    let tiny = resolve_profile("free", Some((8, 8))).expect("tiny free profile");
    let shmup_effect =
        resolve_profile("shmup-effect", Some((8, 8))).expect("centered shmup effect profile");
    let large = resolve_profile("free", Some((64, 64))).expect("large native free profile");
    let metasprite = resolve_profile("free", Some((96, 64))).expect("metasprite profile");
    let oversized_oam = resolve_profile("free", Some((120, 120))).expect("large OAM profile");

    assert_eq!((topdown.frame_width, topdown.frame_height), (16, 16));
    assert_eq!(topdown.anchor, Anchor::BottomCenter);
    assert!(topdown.current_exporter_compatible);
    assert_eq!(
        (topdown_tall.frame_width, topdown_tall.frame_height),
        (16, 32)
    );
    assert_eq!(topdown_tall.anchor, Anchor::BottomCenter);
    assert!(topdown_tall.current_exporter_compatible);
    assert_eq!((platformer.frame_width, platformer.frame_height), (16, 32));
    assert!(platformer.current_exporter_compatible);
    assert!(tiny.current_exporter_compatible);
    assert_eq!(shmup_effect.name, "shmup-effect");
    assert_eq!((shmup_effect.frame_width, shmup_effect.frame_height), (8, 8));
    assert_eq!(shmup_effect.anchor, Anchor::Center);
    assert!(shmup_effect.current_exporter_compatible);
    assert!(large.current_exporter_compatible);
    assert!(metasprite.current_exporter_compatible);
    assert!(!oversized_oam.current_exporter_compatible);
}

#[test]
fn shmup_effect_accepts_small_centered_native_canvases() {
    let drone = resolve_profile("shmup-effect", Some((16, 16))).expect("centered drone profile");
    assert_eq!(drone.anchor, Anchor::Center);
    assert!(resolve_profile("shmup-effect", Some((7, 8))).is_err());
}

#[test]
fn tall_topdown_player_uses_one_native_object_anchored_at_the_feet() {
    let profile = resolve_profile("topdown-tall", None).expect("tall topdown profile");
    let (_, report) = prepare_frames(&[solid_frame(16, 28, Rgba([32, 120, 200, 255]))], &profile)
        .expect("prepared tall topdown player");
    let metadata = build_animation_metadata(
        "player_topdown_tall.png",
        &profile,
        1,
        &AnimationOptions {
            name: "idle_down".to_string(),
            state: "idle".to_string(),
            direction: "down".to_string(),
            fps: 8,
            loops: true,
        },
    )
    .expect("tall topdown metadata");

    assert_eq!((report.output_width, report.output_height), (16, 32));
    assert_eq!(report.hardware_objects_per_frame, 1);
    assert!(report.visible_colors <= 15);
    assert!(report.warnings.is_empty());
    assert_eq!(metadata.frames[0].origin_x, 8);
    assert_eq!(metadata.frames[0].origin_y, 32);
    assert_eq!(metadata.frames[0].tiles.len(), 1);
    assert_eq!(metadata.frames[0].tiles[0].tile_width, 16);
    assert_eq!(metadata.frames[0].tiles[0].tile_height, 32);
}

#[test]
fn wide_platformer_player_uses_one_native_object_with_a_feet_anchor() {
    let profile = resolve_profile("platformer-wide", None).expect("wide platformer profile");
    let (_, report) = prepare_frames(&[solid_frame(18, 29, Rgba([32, 120, 200, 255]))], &profile)
        .expect("prepared wide platformer player");

    assert_eq!((profile.frame_width, profile.frame_height), (32, 32));
    assert_eq!(profile.anchor, Anchor::BottomCenter);
    assert_eq!((report.output_width, report.output_height), (32, 32));
    assert_eq!(report.hardware_objects_per_frame, 1);
    assert_eq!(report.bytes_per_frame_4bpp, 512);
    assert!(report.visible_colors <= 15);
    assert!(report.warnings.is_empty());
}

#[test]
fn free_profile_requires_a_tile_aligned_viable_canvas() {
    let profile = resolve_profile("free", Some((96, 64))).expect("free profile");
    assert_eq!((profile.frame_width, profile.frame_height), (96, 64));
    assert!(profile.current_exporter_compatible);

    assert!(resolve_profile("free", Some((15, 16))).is_err());
    assert!(resolve_profile("free", Some((136, 16))).is_err());
}

#[test]
fn normalizes_all_frames_with_one_shared_scale_and_bottom_center_anchor() {
    let profile = resolve_profile("free", Some((8, 8))).expect("free profile");
    let large = solid_frame(4, 4, Rgba([248, 0, 0, 255]));
    let small = solid_frame(2, 2, Rgba([0, 248, 0, 255]));

    let (sheet, report) = prepare_frames(&[large, small], &profile).expect("prepared sheet");

    assert_eq!(sheet.dimensions(), (16, 8));
    assert_eq!(sheet.get_pixel(0, 0), &Rgba([248, 0, 0, 255]));
    assert_eq!(sheet.get_pixel(8, 0), &Rgba([0, 0, 0, 0]));
    assert_eq!(sheet.get_pixel(10, 4), &Rgba([0, 248, 0, 255]));
    assert_eq!(sheet.get_pixel(13, 7), &Rgba([0, 248, 0, 255]));
    assert_eq!(sheet.get_pixel(14, 7), &Rgba([0, 0, 0, 0]));
    assert_eq!(report.frame_count, 2);
}

#[test]
fn reduces_the_whole_animation_to_fifteen_gba_colors_plus_transparency() {
    let profile = resolve_profile("free", Some((16, 8))).expect("free profile");
    let mut frame = RgbaImage::new(16, 8);
    for x in 0..16 {
        let r = ((x & 3) * 64) as u8;
        let g = (((x >> 2) & 3) * 64) as u8;
        for y in 0..8 {
            frame.put_pixel(x, y, Rgba([r, g, 128, 255]));
        }
    }
    frame.put_pixel(0, 0, Rgba([0, 0, 0, 0]));

    let (sheet, report) = prepare_frames(&[frame], &profile).expect("prepared sheet");

    assert!(report.visible_colors <= 15);
    assert_eq!(sheet.get_pixel(0, 0), &Rgba([0, 0, 0, 0]));
    for pixel in sheet.pixels().filter(|pixel| pixel[3] != 0) {
        for channel in &pixel.0[..3] {
            assert_eq!(*channel % 8, 0);
        }
    }
}

#[test]
fn reports_frame_vram_cost_and_large_sprite_warnings() {
    let platformer = resolve_profile("platformer", None).expect("platformer profile");
    let (_, platformer_report) = prepare_frames(
        &[solid_frame(16, 32, Rgba([248, 248, 248, 255]))],
        &platformer,
    )
    .expect("prepared platformer");
    assert_eq!(platformer_report.bytes_per_frame_4bpp, 256);
    assert!(platformer_report.warnings.is_empty());

    let large = resolve_profile("free", Some((96, 96))).expect("large free profile");
    let (_, large_report) =
        prepare_frames(&[solid_frame(96, 96, Rgba([248, 248, 248, 255]))], &large)
            .expect("prepared large sprite");
    assert!(large_report
        .warnings
        .iter()
        .any(|warning| warning.contains("metasprite")));
}

#[test]
fn splits_a_horizontal_sheet_before_normalizing_each_frame() {
    let mut source = RgbaImage::new(8, 4);
    for y in 0..4 {
        for x in 0..4 {
            source.put_pixel(x, y, Rgba([248, 0, 0, 255]));
            source.put_pixel(x + 4, y, Rgba([0, 0, 248, 255]));
        }
    }

    let frames = split_horizontal_frames(&source, 2).expect("split frames");
    assert_eq!(frames.len(), 2);
    assert_eq!(frames[0].dimensions(), (4, 4));
    assert_eq!(frames[0].get_pixel(3, 3), &Rgba([248, 0, 0, 255]));
    assert_eq!(frames[1].get_pixel(0, 0), &Rgba([0, 0, 248, 255]));
    assert!(split_horizontal_frames(&source, 3).is_err());
    assert!(split_horizontal_frames(&source, 0).is_err());
}

#[test]
fn emits_gba_studio_animation_metadata_for_every_normalized_frame() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let metadata = build_animation_metadata(
        "generated_hero.png",
        &profile,
        3,
        &AnimationOptions {
            name: "walk_down".to_string(),
            state: "walk".to_string(),
            direction: "down".to_string(),
            fps: 10,
            loops: true,
        },
    )
    .expect("animation metadata");

    assert_eq!(metadata.sprite_sheet, "generated_hero.png");
    assert_eq!(metadata.frame_count, 3);
    assert_eq!(metadata.frames[2].tiles[0].slice_x, 32);
    assert_eq!(metadata.frames[2].tiles[0].slice_y, 0);
    assert_eq!(metadata.frames[2].tiles[0].tile_width, 16);
    assert_eq!(metadata.frames[2].origin_x, 8);
    assert_eq!(metadata.frames[2].origin_y, 16);
}

#[test]
fn emits_minimal_native_obj_parts_for_a_large_metasprite_frame() {
    let profile = resolve_profile("free", Some((96, 64))).expect("large free profile");
    let metadata = build_animation_metadata(
        "generated_boss.png",
        &profile,
        2,
        &AnimationOptions::default(),
    )
    .expect("large animation metadata");

    assert_eq!(metadata.frames[0].tiles.len(), 2);
    assert_eq!(
        metadata.frames[0]
            .tiles
            .iter()
            .map(|tile| (
                tile.x,
                tile.y,
                tile.slice_x,
                tile.slice_y,
                tile.tile_width,
                tile.tile_height
            ))
            .collect::<Vec<_>>(),
        vec![(0, 0, 0, 0, 64, 64), (64, 0, 64, 0, 32, 64)]
    );
    assert_eq!(metadata.frames[1].tiles[0].slice_x, 96);
    assert_eq!(metadata.frames[1].tiles[1].slice_x, 160);
}

#[test]
fn reports_vram_and_oam_for_the_whole_animation() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let frames = vec![solid_frame(16, 16, Rgba([248, 0, 0, 255])); 6];
    let (_, report) = prepare_frames(&frames, &profile).expect("prepared sheet");

    assert_eq!(report.tiles_per_frame, 4);
    assert_eq!(report.hardware_objects_per_frame, 1);
    assert_eq!(report.current_runtime_objects_per_frame, 1);
    assert_eq!(report.animation_bytes_4bpp, 768);

    let native_32 = resolve_profile("free", Some((32, 32))).expect("32x32 profile");
    let (_, native_report) =
        prepare_frames(&[solid_frame(32, 32, Rgba([248, 0, 0, 255]))], &native_32)
            .expect("prepared native OBJ");

    assert_eq!(native_report.hardware_objects_per_frame, 1);
    assert_eq!(native_report.current_runtime_objects_per_frame, 1);

    let metasprite = resolve_profile("free", Some((96, 64))).expect("96x64 profile");
    let (_, metasprite_report) =
        prepare_frames(&[solid_frame(96, 64, Rgba([248, 0, 0, 255]))], &metasprite)
            .expect("prepared metasprite");

    assert_eq!(metasprite_report.hardware_objects_per_frame, 2);
    assert_eq!(metasprite_report.current_runtime_objects_per_frame, 2);
}

#[test]
fn renders_an_opaque_nearest_neighbor_preview_for_approval() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let mut frame = RgbaImage::new(16, 16);
    frame.put_pixel(8, 15, Rgba([248, 0, 0, 255]));
    let (sheet, _) = prepare_frames(&[frame], &profile).expect("prepared sheet");

    let preview = render_preview_sheet(&sheet, &profile, 4).expect("preview");

    assert_eq!(preview.dimensions(), (64, 64));
    assert_eq!(preview.get_pixel(32, 60), &Rgba([248, 0, 0, 255]));
    assert_eq!(preview.get_pixel(0, 0)[3], 255);
}

#[test]
fn imports_the_prepared_sprite_animation_and_selected_actor_into_the_current_project_schema() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let metadata = build_animation_metadata(
        "generated_hero.png",
        &profile,
        2,
        &AnimationOptions {
            name: "walk_down".to_string(),
            state: "walk".to_string(),
            direction: "down".to_string(),
            fps: 10,
            loops: true,
        },
    )
    .expect("animation metadata");
    let mut project = json!({
        "name": "Projeto preservado",
        "assets": [{"id": "asset-existing", "name": "old.png", "kind": "Sprite"}],
        "animations": [{"id": "animation-old", "name": "idle_down"}],
        "actors": [
            {"id": "actor-player", "name": "Nina", "spriteSheet": "old.png", "animationName": "idle_down"},
            {"id": "actor-npc", "name": "Guarda", "spriteSheet": "guard.png", "animationName": "idle_down"}
        ]
    });

    let imported = import_prepared_sprite_into_project(
        &mut project,
        &metadata,
        "Assets/sprites/generated_hero.png",
        Some("actor-player"),
    )
    .expect("prepared sprite imported");

    assert_eq!(project["name"], "Projeto preservado");
    assert_eq!(imported.asset_id, "asset-generated-hero-png");
    assert_eq!(project["assets"].as_array().unwrap().len(), 2);
    assert_eq!(
        project["assets"][1]["metadata"]["source"],
        "Assets/sprites/generated_hero.png"
    );
    assert_eq!(project["animations"].as_array().unwrap().len(), 2);
    assert_eq!(project["animations"][1]["name"], "walk_down");
    assert_eq!(project["actors"][0]["spriteSheet"], "generated_hero.png");
    assert_eq!(project["actors"][0]["animationName"], "walk_down");
    assert_eq!(project["actors"][1]["spriteSheet"], "guard.png");
}

#[test]
fn preserves_same_named_animations_from_other_sprite_sheets() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let metadata = build_animation_metadata("npc.png", &profile, 1, &AnimationOptions::default())
        .expect("animation metadata");
    let mut project = json!({
        "assets": [{"id": "asset-player", "name": "player.png", "kind": "Sprite"}],
        "animations": [{
            "id": "animation-player-idle-down",
            "name": "idle_down",
            "spriteSheet": "player.png",
            "frameWidth": 16,
            "frameHeight": 16
        }],
        "animationStates": [{
            "id": "state-player-idle",
            "name": "Idle",
            "animationIDs": ["animation-player-idle-down"]
        }],
        "actors": [{"id": "actor-npc", "name": "NPC"}]
    });

    import_prepared_sprite_into_project(
        &mut project,
        &metadata,
        "Assets/sprites/npc.png",
        Some("actor-npc"),
    )
    .expect("NPC sprite imported");

    assert_eq!(project["animations"].as_array().unwrap().len(), 2);
    assert_eq!(project["animations"][0]["id"], "animation-player-idle-down");
    assert_eq!(project["animations"][1]["spriteSheet"], "npc.png");
    assert_eq!(
        project["animationStates"][0]["animationIDs"][0],
        "animation-player-idle-down"
    );
}

#[test]
fn rejects_a_project_import_when_the_explicit_actor_does_not_exist() {
    let profile = resolve_profile("topdown", None).expect("topdown profile");
    let metadata = build_animation_metadata(
        "generated_hero.png",
        &profile,
        1,
        &AnimationOptions::default(),
    )
    .expect("animation metadata");
    let mut project = json!({"assets": [], "animations": [], "actors": []});

    let error = import_prepared_sprite_into_project(
        &mut project,
        &metadata,
        "Assets/sprites/generated_hero.png",
        Some("missing-actor"),
    )
    .expect_err("missing actor must fail");

    assert!(error.to_string().contains("missing-actor"));
}

#[test]
fn materializes_a_self_contained_project_copy_without_mutating_the_source() {
    let temporary_root = std::env::temp_dir().join(format!(
        "gba-sprite-prep-project-test-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let source_root = temporary_root.join("source");
    let destination_root = temporary_root.join("destination");
    std::fs::create_dir_all(source_root.join("Assets/backgrounds")).unwrap();
    std::fs::write(
        source_root.join("Assets/backgrounds/proof.txt"),
        "preserved",
    )
    .unwrap();
    let source_project = source_root.join("game.gba-project");
    let original_project = json!({
        "name": "Original",
        "assets": [],
        "animations": [],
        "actors": [{"id": "actor-player", "name": "Nina"}]
    });
    let original_bytes = serde_json::to_vec_pretty(&original_project).unwrap();
    std::fs::write(&source_project, &original_bytes).unwrap();
    let prepared_png = temporary_root.join("generated_hero.png");
    solid_frame(16, 16, Rgba([248, 0, 0, 255]))
        .save(&prepared_png)
        .unwrap();
    let metadata = build_animation_metadata(
        "generated_hero.png",
        &resolve_profile("topdown", None).unwrap(),
        1,
        &AnimationOptions::default(),
    )
    .unwrap();
    let destination_project = destination_root.join("game.gba-project");

    materialize_project_copy(
        &source_project,
        &destination_project,
        &prepared_png,
        &metadata,
        Some("actor-player"),
    )
    .expect("project copy");

    assert_eq!(std::fs::read(&source_project).unwrap(), original_bytes);
    assert_eq!(
        std::fs::read_to_string(destination_root.join("Assets/backgrounds/proof.txt")).unwrap(),
        "preserved"
    );
    assert!(destination_root
        .join("Assets/sprites/generated_hero.png")
        .is_file());
    let copied_project: serde_json::Value =
        serde_json::from_slice(&std::fs::read(destination_project).unwrap()).unwrap();
    assert_eq!(copied_project["name"], "Original");
    assert_eq!(
        copied_project["actors"][0]["spriteSheet"],
        "generated_hero.png"
    );

    std::fs::remove_dir_all(temporary_root).unwrap();
}

#[test]
fn uses_one_detected_pixel_grid_for_every_frame_in_an_ai_like_sheet() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/desktop-electron/fixtures/Assets/sprites/player_topdown_4dir.png");
    let source = image::open(fixture).unwrap().to_rgba8();
    let upscaled = image::imageops::resize(
        &source,
        source.width() * 10,
        source.height() * 10,
        image::imageops::FilterType::CatmullRom,
    );
    let frames = split_horizontal_frames(&upscaled, 6).unwrap();

    let snapped = snap_frames_with_spritefusion_for_target(&frames, 15, None, (16, 16)).unwrap();

    let dimensions = snapped
        .iter()
        .map(RgbaImage::dimensions)
        .collect::<Vec<_>>();
    assert!(
        dimensions.iter().all(|size| *size == dimensions[0]),
        "snapped dimensions drifted: {dimensions:?}"
    );
    assert_eq!(snapped[0].dimensions(), (16, 16));
    assert!(snapped.iter().all(|frame| frame.get_pixel(0, 0)[3] == 0));
    assert!(snapped.iter().all(|frame| frame
        .pixels()
        .all(|pixel| pixel[3] == 0 || pixel.0[..3] != [0, 0, 0])));
}
