use gba_sprite_prep::{
    import_prepared_sprite_pack_into_project, materialize_project_pack_copy,
    parse_sprite_pack_manifest, prepare_sprite_pack, resolve_profile,
};
use image::{Rgba, RgbaImage};
use serde_json::json;

const PACK: &str = r#"
{
  "schemaVersion": 1,
  "name": "hero",
  "source": "hero-source.png",
  "profile": "topdown",
  "animations": [
    { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "loops": true, "frames": [0] },
    { "name": "walk_down", "state": "walk", "direction": "down", "fps": 12, "loops": true, "frames": [1, 2] },
    { "name": "attack_down", "state": "attack", "direction": "down", "fps": 10, "loops": false, "frames": [3] },
    { "name": "hurt_down", "state": "hurt", "direction": "down", "fps": 6, "loops": false, "frames": [4] }
  ]
}
"#;

#[test]
fn prepares_a_multi_state_pack_with_stable_frame_offsets() {
    let manifest = parse_sprite_pack_manifest(PACK).expect("valid manifest");
    let mut source = RgbaImage::new(80, 16);
    for frame in 0..5 {
        for y in 2..14 {
            for x in (frame * 16 + 2)..(frame * 16 + 14) {
                source.put_pixel(x, y, Rgba([40 * frame as u8, 32, 160, 255]));
            }
        }
    }

    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared pack");

    assert_eq!(prepared.sheet.dimensions(), (80, 16));
    assert_eq!(prepared.animations.len(), 4);
    assert_eq!(prepared.animations[0].frames[0].tiles[0].slice_x, 0);
    assert_eq!(prepared.animations[1].frames[0].tiles[0].slice_x, 16);
    assert_eq!(prepared.animations[1].frames[1].tiles[0].slice_x, 32);
    assert_eq!(prepared.animations[2].frames[0].tiles[0].slice_x, 48);
    assert_eq!(prepared.animations[3].frames[0].tiles[0].slice_x, 64);
    assert_eq!(prepared.animations[2].fps, 10);
    assert!(!prepared.animations[2].loops);
}

#[test]
fn accepts_explicit_opt_in_for_mirrored_obj_reuse() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "asymmetric-actor",
          "source": "actor.png",
          "profile": "topdown",
          "optimization": { "allowMirroredFrames": true },
          "animations": [
            { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .expect("optimization options must parse");

    assert!(manifest.optimization.allow_mirrored_frames);
}

#[test]
fn imports_every_animation_and_selects_the_first_for_the_actor() {
    let manifest = parse_sprite_pack_manifest(PACK).expect("valid manifest");
    let profile = resolve_profile("topdown", None).expect("profile");
    let source = RgbaImage::from_pixel(80, 16, Rgba([32, 64, 96, 255]));
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared pack");
    assert_eq!(prepared.report.profile, profile);
    let mut project = json!({
        "data": {
            "assets": [],
            "animations": [],
            "actors": [{ "id": "actor-player", "name": "Player" }]
        }
    });

    let result = import_prepared_sprite_pack_into_project(
        &mut project,
        &prepared.animations,
        "Assets/sprites/hero.png",
        Some("actor-player"),
    )
    .expect("pack imported");

    assert_eq!(result.animation_ids.len(), 4);
    assert_eq!(project["data"]["animations"].as_array().unwrap().len(), 4);
    assert_eq!(project["data"]["actors"][0]["spriteSheet"], "hero.png");
    assert_eq!(project["data"]["actors"][0]["animationName"], "idle_down");
}

#[test]
fn rejects_duplicate_state_direction_pairs() {
    let duplicate = PACK.replace(
        "\"name\": \"hurt_down\", \"state\": \"hurt\"",
        "\"name\": \"hurt_down\", \"state\": \"idle\"",
    );
    let error = parse_sprite_pack_manifest(&duplicate).expect_err("duplicate must fail");
    assert!(error.to_string().contains("state/direction"));
}

#[test]
fn accepts_platformer_jump_and_fall_states() {
    let platformer = r#"
    {
      "schemaVersion": 1,
      "name": "platformer-hero",
      "source": "platformer-hero.png",
      "profile": "platformer",
      "animations": [
        { "name": "idle_right", "state": "idle", "direction": "right", "fps": 8, "loops": true, "frames": [0] },
        { "name": "walk_right", "state": "walk", "direction": "right", "fps": 12, "loops": true, "frames": [1, 2] },
        { "name": "jump_right", "state": "jump", "direction": "right", "fps": 8, "loops": false, "frames": [3] },
        { "name": "fall_right", "state": "fall", "direction": "right", "fps": 8, "loops": true, "frames": [4] },
        { "name": "attack_right", "state": "attack", "direction": "right", "fps": 10, "loops": false, "frames": [5] },
        { "name": "hurt_right", "state": "hurt", "direction": "right", "fps": 6, "loops": false, "frames": [6] }
      ]
    }
    "#;

    let manifest = parse_sprite_pack_manifest(platformer).expect("platformer states must be valid");
    assert_eq!(manifest.animations[2].state, "jump");
    assert_eq!(manifest.animations[3].state, "fall");
}

#[test]
fn accepts_tactical_move_and_defeat_states() {
    let tactical = r#"
    {
      "schemaVersion": 2,
      "name": "tactical-unit",
      "source": "tactical-unit.png",
      "profile": "free",
      "width": 48,
      "height": 48,
      "layout": { "mode": "horizontal", "rows": 1, "columns": 2 },
      "animations": [
        { "name": "move_down", "state": "move", "direction": "down", "fps": 8, "loops": true, "frames": [0] },
        { "name": "defeat_down", "state": "defeat", "direction": "down", "fps": 6, "loops": false, "frames": [1] }
    ]
    }
    "#;

    let manifest = parse_sprite_pack_manifest(tactical)
        .expect("tactical move and defeat states must be valid");
    assert_eq!(manifest.animations[0].state, "move");
    assert_eq!(manifest.animations[1].state, "defeat");
}

#[test]
fn accepts_luta_special_and_guard_states() {
    let manifest = r#"
    {
      "schemaVersion": 1,
      "name": "luta-fighter",
      "source": "luta-fighter.png",
      "preset": "luta-fighter",
      "animations": [
        { "name": "special_right", "state": "special", "direction": "right", "fps": 10, "loops": false, "frames": [0] },
        { "name": "guard_right", "state": "guard", "direction": "right", "fps": 8, "loops": true, "frames": [0] }
      ]
    }
    "#;

    let manifest = parse_sprite_pack_manifest(manifest).expect("luta states must be valid");
    assert_eq!(manifest.animations[0].state, "special");
    assert_eq!(manifest.animations[1].state, "guard");
}

#[test]
fn prepares_racing_directional_view_states_without_rewriting_them_to_walk() {
    let racing = r#"
    {
      "schemaVersion": 2,
      "name": "racing-vehicle",
      "source": "racing-vehicle.png",
      "profile": "racing",
      "layout": { "mode": "horizontal", "rows": 1, "columns": 1 },
      "animations": [
        { "name": "directional_view_view_down", "state": "directional_view", "direction": "view_down", "fps": 8, "loops": true, "frames": [0] },
        { "name": "directional_view_view_right", "state": "directional_view", "direction": "view_right", "fps": 8, "loops": true, "frames": [0] },
        { "name": "directional_view_view_up", "state": "directional_view", "direction": "view_up", "fps": 8, "loops": true, "frames": [0] },
        { "name": "directional_view_view_left", "state": "directional_view", "direction": "view_left", "fps": 8, "loops": true, "frames": [0] }
      ]
    }
    "#;

    let manifest =
        parse_sprite_pack_manifest(racing).expect("racing directional views must be valid");
    let mut source = RgbaImage::new(32, 32);
    for y in 4..28 {
        for x in 4..28 {
            source.put_pixel(x, y, Rgba([32, 64, 160, 255]));
        }
    }
    let prepared = prepare_sprite_pack(&source, &manifest, false, None)
        .expect("racing directional views must prepare");

    assert_eq!(prepared.animations.len(), 4);
    assert!(prepared
        .animations
        .iter()
        .all(|animation| animation.state == "directional_view"));
    assert_eq!(prepared.animations[3].direction, "view_left");
    assert!(!prepared
        .animations
        .iter()
        .any(|animation| animation.state == "walk"));
}

#[test]
fn materializes_a_project_copy_with_the_complete_pack() {
    let manifest = parse_sprite_pack_manifest(PACK).expect("valid manifest");
    let source = RgbaImage::from_pixel(80, 16, Rgba([32, 64, 96, 255]));
    let prepared = prepare_sprite_pack(&source, &manifest, false, None).expect("prepared pack");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-pack-test-{nonce}"));
    let source_root = root.join("source");
    let destination_root = root.join("destination");
    std::fs::create_dir_all(source_root.join("Assets")).unwrap();
    let source_project = source_root.join("game.gba-project");
    let destination_project = destination_root.join("game.gba-project");
    let prepared_png = root.join("hero.png");
    prepared.sheet.save(&prepared_png).unwrap();
    std::fs::write(
        &source_project,
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

    let result = materialize_project_pack_copy(
        &source_project,
        &destination_project,
        &prepared_png,
        &prepared.animations,
        Some("actor-player"),
    )
    .expect("project copy");

    let copied: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&destination_project).unwrap()).unwrap();
    assert_eq!(result.animation_ids.len(), 4);
    assert_eq!(copied["data"]["animations"].as_array().unwrap().len(), 4);
    assert!(destination_root.join("Assets/sprites/hero.png").is_file());
    assert!(!source_root.join("Assets/sprites/hero.png").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn expands_a_v2_animation_grid_into_state_direction_frame_mappings() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "grid-hero",
          "source": "grid-hero.png",
          "profile": "topdown",
          "layout": { "mode": "auto" },
          "animationGrid": {
            "directionAxis": "rows",
            "directions": ["down", "left", "right", "up"],
            "states": [
              { "state": "idle", "frameCount": 1, "fps": 8 },
              { "state": "walk", "frameCount": 3, "fps": 12 }
            ]
          }
        }"#,
    )
    .expect("v2 animation grid");

    assert_eq!(manifest.schema_version, 2);
    assert_eq!(manifest.layout.rows, Some(4));
    assert_eq!(manifest.layout.columns, Some(4));
    assert_eq!(manifest.animations.len(), 8);
    assert_eq!(manifest.animations[0].name, "idle_down");
    assert_eq!(manifest.animations[0].frames, vec![0]);
    assert_eq!(manifest.animations[1].name, "walk_down");
    assert_eq!(manifest.animations[1].frames, vec![1, 2, 3]);
    assert_eq!(manifest.animations[2].name, "idle_left");
    assert_eq!(manifest.animations[2].frames, vec![4]);
    assert_eq!(manifest.animations[7].name, "walk_up");
    assert_eq!(manifest.animations[7].frames, vec![13, 14, 15]);
}

#[test]
fn maps_v2_directions_across_columns_with_source_offsets() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "isometric-grid",
          "source": "isometric.png",
          "profile": "isometric",
          "layout": { "mode": "grid", "rows": 18, "columns": 27, "spacing": 1 },
          "animationGrid": {
            "directionAxis": "columns",
            "firstRow": 11,
            "firstColumn": 23,
            "directions": ["down-left", "down-right", "up-left", "up-right"],
            "states": [
              { "state": "idle", "frameCount": 1, "fps": 8 }
            ]
          }
        }"#,
    )
    .expect("column animation grid");

    assert_eq!(manifest.animations.len(), 4);
    assert_eq!(manifest.animations[0].frames, vec![320]);
    assert_eq!(manifest.animations[1].frames, vec![321]);
    assert_eq!(manifest.animations[2].frames, vec![322]);
    assert_eq!(manifest.animations[3].frames, vec![323]);
}

#[test]
fn rejects_mixed_explicit_and_automatic_v2_animation_mappings() {
    let error = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 2,
          "name": "ambiguous-grid",
          "source": "ambiguous.png",
          "profile": "topdown",
          "layout": { "mode": "grid", "rows": 1, "columns": 1 },
          "animationGrid": {
            "directions": ["down"],
            "states": [{ "state": "idle", "frameCount": 1, "fps": 8 }]
          },
          "animations": [
            { "name": "idle_down", "state": "idle", "direction": "down", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .expect_err("ambiguous mapping must fail");

    assert!(error.to_string().contains("animationGrid or animations"));
}
