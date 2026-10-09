use crate::{resolve_profile, PrepError};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpritePreset {
    pub schema_version: u32,
    pub name: String,
    pub profile: String,
    pub frame_width: Option<u32>,
    pub frame_height: Option<u32>,
    pub scene_actor_count: u32,
    pub collision_width: u32,
    pub collision_height: u32,
    pub recommended_states: Vec<String>,
}

fn preset(
    name: &str,
    profile: &str,
    size: (u32, u32),
    scene_actor_count: u32,
    collision: (u32, u32),
    states: &[&str],
) -> SpritePreset {
    SpritePreset {
        schema_version: 1,
        name: name.to_string(),
        profile: profile.to_string(),
        frame_width: Some(size.0),
        frame_height: Some(size.1),
        scene_actor_count,
        collision_width: collision.0,
        collision_height: collision.1,
        recommended_states: states.iter().map(|state| (*state).to_string()).collect(),
    }
}

pub fn builtin_sprite_presets() -> Vec<SpritePreset> {
    vec![
        preset(
            "npc-topdown",
            "topdown",
            (16, 16),
            16,
            (16, 16),
            &["idle", "walk", "hurt"],
        ),
        preset(
            "player-topdown",
            "topdown-tall",
            (16, 32),
            1,
            (16, 16),
            &["idle", "walk", "attack", "hurt"],
        ),
        preset(
            "player-platformer",
            "platformer-wide",
            (32, 32),
            1,
            (16, 16),
            &["idle", "walk", "jump", "fall", "attack", "hurt"],
        ),
        preset(
            "isometric-player",
            "isometric",
            (32, 32),
            1,
            (16, 16),
            &["idle", "walk", "attack", "hurt"],
        ),
        preset(
            "racing-player",
            "racing",
            (32, 32),
            1,
            (16, 24),
            &["idle", "walk", "hurt"],
        ),
        preset(
            "shmup-player",
            "shmup",
            (32, 32),
            1,
            (16, 16),
            &["walk", "hurt"],
        ),
        preset(
            "shmup-player-large",
            "shmup-large",
            (64, 64),
            1,
            (24, 24),
            &["walk", "hurt"],
        ),
        preset(
            "world-map-player",
            "world-map",
            (16, 16),
            1,
            (8, 8),
            &["idle", "walk"],
        ),
        preset(
            "luta-fighter",
            "free",
            (32, 64),
            2,
            (24, 48),
            &["idle", "walk", "jump", "fall", "attack", "special", "guard", "hurt"],
        ),
        preset(
            "enemy",
            "topdown",
            (16, 16),
            12,
            (16, 16),
            &["idle", "walk", "attack", "hurt"],
        ),
        preset(
            "boss",
            "free",
            (64, 64),
            1,
            (48, 32),
            &["idle", "walk", "attack", "hurt"],
        ),
        preset("item", "free", (8, 8), 24, (8, 8), &["idle"]),
        preset("projectile", "free", (8, 8), 24, (8, 8), &["idle", "hurt"]),
        preset("scenery", "free", (32, 32), 8, (32, 16), &["idle", "hurt"]),
        preset(
            "portrait",
            "visual-novel",
            (64, 64),
            1,
            (64, 64),
            &["idle", "hurt"],
        ),
        preset("ui", "menu", (16, 16), 16, (16, 16), &["idle"]),
    ]
}

pub fn resolve_sprite_preset(name: &str) -> Result<SpritePreset, PrepError> {
    let normalized = name.trim().to_lowercase().replace([' ', '_'], "-");
    builtin_sprite_presets()
        .into_iter()
        .find(|preset| preset.name == normalized)
        .ok_or_else(|| PrepError(format!("unknown sprite preset '{name}'")))
}

fn validate_sprite_preset(preset: &SpritePreset) -> Result<(), PrepError> {
    if preset.schema_version != 1 {
        return Err(PrepError(format!(
            "unsupported sprite preset schemaVersion {}; expected 1",
            preset.schema_version
        )));
    }
    if preset.name.trim().is_empty() {
        return Err(PrepError("sprite preset name cannot be empty".to_string()));
    }
    if preset.scene_actor_count == 0 || preset.collision_width == 0 || preset.collision_height == 0
    {
        return Err(PrepError(
            "sprite preset budgets and collision dimensions must be greater than zero".to_string(),
        ));
    }
    let custom_size = preset.frame_width.zip(preset.frame_height);
    if preset.frame_width.is_some() != preset.frame_height.is_some() {
        return Err(PrepError(
            "sprite preset frameWidth and frameHeight must be provided together".to_string(),
        ));
    }
    resolve_profile(&preset.profile, custom_size)?;
    Ok(())
}

pub fn save_sprite_preset(path: &Path, preset: &SpritePreset) -> Result<(), PrepError> {
    validate_sprite_preset(preset)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).map_err(|error| {
            PrepError(format!(
                "failed to create sprite preset directory '{}': {error}",
                parent.display()
            ))
        })?;
    }
    let bytes = serde_json::to_vec_pretty(preset)
        .map_err(|error| PrepError(format!("failed to serialize sprite preset: {error}")))?;
    std::fs::write(path, bytes).map_err(|error| {
        PrepError(format!(
            "failed to write sprite preset '{}': {error}",
            path.display()
        ))
    })
}

pub fn load_sprite_preset(path: &Path) -> Result<SpritePreset, PrepError> {
    let bytes = std::fs::read(path).map_err(|error| {
        PrepError(format!(
            "failed to read sprite preset '{}': {error}",
            path.display()
        ))
    })?;
    let preset: SpritePreset = serde_json::from_slice(&bytes)
        .map_err(|error| PrepError(format!("invalid sprite preset JSON: {error}")))?;
    validate_sprite_preset(&preset)?;
    Ok(preset)
}
