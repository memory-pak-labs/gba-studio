use gba_sprite_prep::{
    builtin_sprite_presets, load_sprite_pack_manifest, load_sprite_preset,
    parse_sprite_pack_manifest, resolve_sprite_preset, save_sprite_preset, SpritePreset,
};

#[test]
fn exposes_the_sixteen_project_actor_presets() {
    let names = builtin_sprite_presets()
        .into_iter()
        .map(|preset| preset.name)
        .collect::<Vec<_>>();

    assert_eq!(names.len(), 16);
    for expected in [
        "npc-topdown",
        "player-topdown",
        "player-platformer",
        "isometric-player",
        "racing-player",
        "shmup-player",
        "shmup-player-large",
        "world-map-player",
        "luta-fighter",
        "enemy",
        "boss",
        "item",
        "projectile",
        "scenery",
        "portrait",
        "ui",
    ] {
        assert!(names.contains(&expected.to_string()), "missing {expected}");
    }
    assert_eq!(resolve_sprite_preset("boss").unwrap().frame_width, Some(64));
    let player_topdown = resolve_sprite_preset("player-topdown").unwrap();
    assert_eq!(player_topdown.profile, "topdown-tall");
    assert_eq!(
        (player_topdown.frame_width, player_topdown.frame_height),
        (Some(16), Some(32))
    );
    assert_eq!(
        (
            player_topdown.collision_width,
            player_topdown.collision_height
        ),
        (16, 16)
    );
    let player_platformer = resolve_sprite_preset("player-platformer").unwrap();
    assert_eq!(player_platformer.profile, "platformer-wide");
    assert_eq!(
        (
            player_platformer.frame_width,
            player_platformer.frame_height
        ),
        (Some(32), Some(32))
    );
    assert_eq!(
        (
            player_platformer.collision_width,
            player_platformer.collision_height
        ),
        (16, 16)
    );
    assert_eq!(
        player_platformer.recommended_states,
        vec!["idle", "walk", "jump", "fall", "attack", "hurt"]
    );
    for (name, profile, size, collision, scene_actor_count, states) in [
        (
            "isometric-player",
            "isometric",
            (32, 32),
            (16, 16),
            1,
            vec!["idle", "walk", "attack", "hurt"],
        ),
        (
            "racing-player",
            "racing",
            (32, 32),
            (16, 24),
            1,
            vec!["idle", "walk", "hurt"],
        ),
        (
            "shmup-player",
            "shmup",
            (32, 32),
            (16, 16),
            1,
            vec!["walk", "hurt"],
        ),
        (
            "shmup-player-large",
            "shmup-large",
            (64, 64),
            (24, 24),
            1,
            vec!["walk", "hurt"],
        ),
        (
            "world-map-player",
            "world-map",
            (16, 16),
            (8, 8),
            1,
            vec!["idle", "walk"],
        ),
        (
            "luta-fighter",
            "free",
            (32, 64),
            (24, 48),
            2,
            vec![
                "idle", "walk", "jump", "fall", "attack", "special", "guard", "hurt"
            ],
        ),
    ] {
        let preset = resolve_sprite_preset(name).unwrap();
        assert_eq!(preset.profile, profile);
        assert_eq!(
            (preset.frame_width, preset.frame_height),
            (Some(size.0), Some(size.1))
        );
        assert_eq!((preset.collision_width, preset.collision_height), collision);
        assert_eq!(preset.scene_actor_count, scene_actor_count);
        assert_eq!(preset.recommended_states, states);
    }
    assert_eq!(
        resolve_sprite_preset("projectile")
            .unwrap()
            .scene_actor_count,
        24
    );
}

#[test]
fn applies_the_fighter_preset_to_a_manifest() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "fighter",
          "source": "fighter.png",
          "preset": "luta-fighter",
          "animations": [
            { "name": "idle_right", "state": "idle", "direction": "right", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .expect("fighter preset");

    assert_eq!(manifest.profile, "free");
    assert_eq!((manifest.width, manifest.height), (Some(32), Some(64)));
    assert_eq!(
        (manifest.collision_width, manifest.collision_height),
        (Some(24), Some(48))
    );
    assert_eq!(manifest.scene_actor_count, Some(2));
}

#[test]
fn applies_builtin_and_saved_presets_to_pack_manifests() {
    let builtin = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "boss",
          "source": "boss.png",
          "preset": "boss",
          "animations": [
            { "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .expect("built-in preset");
    assert_eq!(builtin.profile, "free");
    assert_eq!((builtin.width, builtin.height), (Some(64), Some(64)));

    let platformer = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "player-platformer",
          "source": "player-platformer.png",
          "preset": "player-platformer",
          "animations": [
            { "name": "idle_right", "state": "idle", "direction": "right", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .expect("platformer preset");
    assert_eq!(platformer.profile, "platformer-wide");
    assert_eq!((platformer.width, platformer.height), (None, None));
    assert_eq!(
        (platformer.collision_width, platformer.collision_height),
        (Some(16), Some(16))
    );

    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-preset-manifest-{nonce}"));
    std::fs::create_dir_all(&root).unwrap();
    let preset_path = root.join("custom.json");
    save_sprite_preset(
        &preset_path,
        &SpritePreset {
            schema_version: 1,
            name: "custom".to_string(),
            profile: "free".to_string(),
            frame_width: Some(48),
            frame_height: Some(64),
            scene_actor_count: 2,
            collision_width: 32,
            collision_height: 16,
            recommended_states: vec!["idle".to_string()],
        },
    )
    .unwrap();
    let manifest_path = root.join("sprite-pack.json");
    std::fs::write(
        &manifest_path,
        r#"{
          "schemaVersion": 1,
          "name": "custom-object",
          "source": "object.png",
          "presetFile": "custom.json",
          "animations": [
            { "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .unwrap();

    let custom = load_sprite_pack_manifest(&manifest_path).expect("custom preset manifest");
    assert_eq!(custom.profile, "free");
    assert_eq!((custom.width, custom.height), (Some(48), Some(64)));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn saves_and_reloads_a_custom_preset() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-sprite-preset-{nonce}"));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("large-interactive-object.json");
    let preset = SpritePreset {
        schema_version: 1,
        name: "large-interactive-object".to_string(),
        profile: "free".to_string(),
        frame_width: Some(48),
        frame_height: Some(64),
        scene_actor_count: 3,
        collision_width: 32,
        collision_height: 16,
        recommended_states: vec!["idle".to_string(), "hurt".to_string()],
    };

    save_sprite_preset(&path, &preset).expect("save preset");
    let loaded = load_sprite_preset(&path).expect("load preset");

    assert_eq!(loaded, preset);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn applies_preset_scene_and_collision_budgets_to_the_manifest() {
    let manifest = parse_sprite_pack_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "projectile",
          "source": "projectile.png",
          "preset": "projectile",
          "animations": [
            { "name": "idle", "state": "idle", "direction": "none", "fps": 8, "frames": [0] }
          ]
        }"#,
    )
    .unwrap();

    assert_eq!(manifest.scene_actor_count, Some(24));
    assert_eq!(manifest.collision_width, Some(8));
    assert_eq!(manifest.collision_height, Some(8));
}
