use image::{imageops, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use spritefusion_pixel_snapper::{process_batch_with_reporter, BatchConfig};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fmt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

mod inspector;
pub use inspector::*;
mod presets;
pub use presets::*;
mod batch;
pub use batch::*;
mod background;
pub use background::*;
mod sprite_optimizer;
pub use sprite_optimizer::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Anchor {
    BottomCenter,
    Center,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SpriteProfile {
    pub name: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub anchor: Anchor,
    pub max_visible_colors: usize,
    pub current_exporter_compatible: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PreparationReport {
    pub profile: SpriteProfile,
    pub frame_count: usize,
    pub output_width: u32,
    pub output_height: u32,
    pub visible_colors: usize,
    pub tiles_per_frame: u32,
    pub bytes_per_frame_4bpp: u32,
    pub animation_bytes_4bpp: u32,
    pub hardware_objects_per_frame: u32,
    pub current_runtime_objects_per_frame: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnimationOptions {
    pub name: String,
    pub state: String,
    pub direction: String,
    pub fps: u32,
    pub loops: bool,
}

impl Default for AnimationOptions {
    fn default() -> Self {
        Self {
            name: "idle_down".to_string(),
            state: "idle".to_string(),
            direction: "down".to_string(),
            fps: 8,
            loops: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationMetadata {
    pub id: String,
    pub name: String,
    pub sprite_sheet: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub fps: u32,
    pub loops: bool,
    pub frame_count: usize,
    pub state: String,
    pub direction: String,
    pub color_mode: String,
    pub frames: Vec<AnimationFrameMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationFrameMetadata {
    pub frame_index: usize,
    pub source_frame_index: usize,
    pub width: u32,
    pub height: u32,
    pub origin_x: u32,
    pub origin_y: u32,
    pub tiles: Vec<AnimationTileMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTileMetadata {
    pub x: i32,
    pub y: i32,
    pub slice_x: u32,
    pub slice_y: u32,
    pub source_sheet: String,
    pub tile_width: u32,
    pub tile_height: u32,
    pub flip_x: bool,
    pub flip_y: bool,
    pub obj_palette: String,
    pub palette_index: u8,
    pub priority: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectImportResult {
    pub asset_id: String,
    pub animation_id: String,
    pub actor_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteOptimizationManifest {
    #[serde(default)]
    pub allow_mirrored_frames: bool,
}

/// Declares that a source image is already authored on a GBA-compatible sprite grid.
///
/// The contract is deliberately opt-in: older authoring flows can still use the
/// reconstruction pipeline, while new approved sources can fail before any crop,
/// resize, alpha threshold, or palette reduction would hide an authoring problem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpriteSourceContract {
    GbaNative,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteSourceAudit {
    pub source_width: u32,
    pub source_height: u32,
    pub frame_count: usize,
    pub frame_width: u32,
    pub frame_height: u32,
    pub integer_scale: Option<u32>,
    pub transparent_pixels: u64,
    pub opaque_pixels: u64,
    pub partial_alpha_pixels: u64,
    pub visible_colors: usize,
    pub max_visible_colors: usize,
    pub violations: Vec<String>,
    pub passed: bool,
}

/// A source rectangle selected from an approved visual candidate before it is
/// staged on the final GBA sprite grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateFrameRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl CandidateFrameRegion {
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }
}

/// Describes the light, low-chroma matte used by image-generation previews.
/// Only matching pixels connected to the outer edge are made transparent, so
/// highlights enclosed by the sprite remain opaque.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateMatte {
    pub minimum_channel: u8,
    pub maximum_spread: u8,
}

impl CandidateMatte {
    pub fn light_neutral(minimum_channel: u8, maximum_spread: u8) -> Self {
        Self {
            minimum_channel,
            maximum_spread,
        }
    }

    fn matches(&self, pixel: Rgba<u8>) -> bool {
        let minimum = pixel[0].min(pixel[1]).min(pixel[2]);
        let maximum = pixel[0].max(pixel[1]).max(pixel[2]);
        pixel[3] != 0
            && minimum >= self.minimum_channel
            && maximum.saturating_sub(minimum) <= self.maximum_spread
    }
}

/// Keeps source staging separate from the deliberate 4 BPP palette decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CandidatePalettePolicy {
    Preserve,
    ReduceTo4Bpp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateStageReport {
    pub frame_count: usize,
    pub frame_width: u32,
    pub frame_height: u32,
    pub cleared_matte_pixels: u64,
    pub visible_colors_before_palette: usize,
    pub visible_colors: usize,
    pub max_visible_colors: usize,
    pub palette_reduced: bool,
}

impl Default for SpriteOptimizationManifest {
    fn default() -> Self {
        Self {
            allow_mirrored_frames: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpritePackManifest {
    pub schema_version: u32,
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub profile: String,
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub preset_file: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub scene_actor_count: Option<u32>,
    #[serde(default)]
    pub collision_width: Option<u32>,
    #[serde(default)]
    pub collision_height: Option<u32>,
    #[serde(default)]
    pub optimization: SpriteOptimizationManifest,
    #[serde(default)]
    pub source_contract: Option<SpriteSourceContract>,
    #[serde(default)]
    pub layout: FrameLayoutSpec,
    #[serde(default)]
    pub animation_grid: Option<AnimationGridSpec>,
    #[serde(default)]
    pub animations: Vec<SpritePackAnimationSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FrameLayoutMode {
    Auto,
    Horizontal,
    Vertical,
    Grid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameLayoutSpec {
    #[serde(default = "default_frame_layout_mode")]
    pub mode: FrameLayoutMode,
    #[serde(default)]
    pub rows: Option<usize>,
    #[serde(default)]
    pub columns: Option<usize>,
    #[serde(default)]
    pub margin: u32,
    #[serde(default)]
    pub spacing: u32,
}

impl Default for FrameLayoutSpec {
    fn default() -> Self {
        Self {
            mode: FrameLayoutMode::Horizontal,
            rows: None,
            columns: None,
            margin: 0,
            spacing: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnimationGridDirectionAxis {
    #[default]
    Rows,
    Columns,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationGridSpec {
    #[serde(default)]
    pub direction_axis: AnimationGridDirectionAxis,
    #[serde(default)]
    pub first_row: usize,
    #[serde(default)]
    pub first_column: usize,
    pub directions: Vec<String>,
    pub states: Vec<AnimationGridStateSpec>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationGridStateSpec {
    pub state: String,
    pub frame_count: usize,
    pub fps: u32,
    #[serde(default = "default_true")]
    pub loops: bool,
    #[serde(default)]
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpritePackAnimationSpec {
    pub name: String,
    pub state: String,
    pub direction: String,
    pub fps: u32,
    #[serde(default = "default_true")]
    pub loops: bool,
    pub frames: Vec<usize>,
}

#[derive(Debug)]
pub struct PreparedSpritePack {
    pub sheet: RgbaImage,
    pub report: PreparationReport,
    pub animations: Vec<AnimationMetadata>,
    pub detection: FrameDetectionReport,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDetectionReport {
    pub strategy: String,
    pub rows: usize,
    pub columns: usize,
    pub confidence: f32,
    pub frames: Vec<DetectedFrame>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedFrame {
    pub index: usize,
    pub row: usize,
    pub column: usize,
    pub source_x: u32,
    pub source_y: u32,
    pub source_width: u32,
    pub source_height: u32,
    pub empty: bool,
    pub duplicate_of: Option<usize>,
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpritePackImportResult {
    pub asset_id: String,
    pub animation_ids: Vec<String>,
    pub actor_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepError(pub String);

impl fmt::Display for PrepError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for PrepError {}

fn default_true() -> bool {
    true
}

fn default_frame_layout_mode() -> FrameLayoutMode {
    FrameLayoutMode::Horizontal
}

fn animation_name(state: &str, direction: &str) -> String {
    let state = state.trim().to_lowercase().replace('-', "_");
    let direction = direction.trim().to_lowercase().replace('-', "_");
    if direction == "none" {
        state
    } else {
        format!("{state}_{direction}")
    }
}

fn checked_grid_extent(start: usize, length: usize, label: &str) -> Result<usize, PrepError> {
    start
        .checked_add(length)
        .ok_or_else(|| PrepError(format!("animationGrid {label} exceeds the supported range")))
}

fn expand_animation_grid(manifest: &mut SpritePackManifest) -> Result<(), PrepError> {
    let Some(grid) = manifest.animation_grid.as_ref() else {
        return Ok(());
    };
    if manifest.schema_version != 2 {
        return Err(PrepError(
            "animationGrid requires sprite pack schemaVersion 2".to_string(),
        ));
    }
    if !manifest.animations.is_empty() {
        return Err(PrepError(
            "sprite pack must use animationGrid or animations, not both".to_string(),
        ));
    }
    if grid.directions.is_empty() || grid.states.is_empty() {
        return Err(PrepError(
            "animationGrid requires at least one direction and one state".to_string(),
        ));
    }

    let mut cursor = 0usize;
    let mut state_offsets = Vec::with_capacity(grid.states.len());
    for state in &grid.states {
        if state.frame_count == 0 {
            return Err(PrepError(format!(
                "animationGrid state '{}' frameCount must be greater than zero",
                state.state
            )));
        }
        let offset = state.offset.unwrap_or(cursor);
        let end = checked_grid_extent(offset, state.frame_count, "state frame range")?;
        cursor = cursor.max(end);
        state_offsets.push(offset);
    }

    let direction_extent = match grid.direction_axis {
        AnimationGridDirectionAxis::Rows => {
            checked_grid_extent(grid.first_row, grid.directions.len(), "row range")?
        }
        AnimationGridDirectionAxis::Columns => {
            checked_grid_extent(grid.first_column, grid.directions.len(), "column range")?
        }
    };
    let state_extent = match grid.direction_axis {
        AnimationGridDirectionAxis::Rows => {
            checked_grid_extent(grid.first_column, cursor, "column range")?
        }
        AnimationGridDirectionAxis::Columns => {
            checked_grid_extent(grid.first_row, cursor, "row range")?
        }
    };
    let (required_rows, required_columns) = match grid.direction_axis {
        AnimationGridDirectionAxis::Rows => (direction_extent, state_extent),
        AnimationGridDirectionAxis::Columns => (state_extent, direction_extent),
    };

    if manifest.layout == FrameLayoutSpec::default() {
        manifest.layout.mode = FrameLayoutMode::Auto;
    }
    match manifest.layout.mode {
        FrameLayoutMode::Auto => {
            if manifest.layout.rows.is_some() != manifest.layout.columns.is_some() {
                return Err(PrepError(
                    "automatic animationGrid layout requires both rows and columns when either is provided"
                        .to_string(),
                ));
            }
            manifest.layout.rows.get_or_insert(required_rows);
            manifest.layout.columns.get_or_insert(required_columns);
        }
        FrameLayoutMode::Grid => {}
        FrameLayoutMode::Horizontal | FrameLayoutMode::Vertical => {
            return Err(PrepError(
                "animationGrid requires a grid or automatic frame layout".to_string(),
            ));
        }
    }
    let rows = manifest
        .layout
        .rows
        .ok_or_else(|| PrepError("animationGrid could not resolve layout rows".to_string()))?;
    let columns = manifest
        .layout
        .columns
        .ok_or_else(|| PrepError("animationGrid could not resolve layout columns".to_string()))?;
    if rows < required_rows || columns < required_columns {
        return Err(PrepError(format!(
            "animationGrid requires at least {required_rows} rows and {required_columns} columns"
        )));
    }

    let mut animations = Vec::with_capacity(grid.directions.len() * grid.states.len());
    for (direction_index, direction) in grid.directions.iter().enumerate() {
        for (state, offset) in grid.states.iter().zip(state_offsets.iter().copied()) {
            let frames = (0..state.frame_count)
                .map(|frame_offset| {
                    let (row, column) = match grid.direction_axis {
                        AnimationGridDirectionAxis::Rows => (
                            grid.first_row + direction_index,
                            grid.first_column + offset + frame_offset,
                        ),
                        AnimationGridDirectionAxis::Columns => (
                            grid.first_row + offset + frame_offset,
                            grid.first_column + direction_index,
                        ),
                    };
                    row.checked_mul(columns)
                        .and_then(|index| index.checked_add(column))
                        .ok_or_else(|| PrepError("animationGrid frame index overflow".to_string()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            animations.push(SpritePackAnimationSpec {
                name: animation_name(&state.state, direction),
                state: state.state.clone(),
                direction: direction.clone(),
                fps: state.fps,
                loops: state.loops,
                frames,
            });
        }
    }
    manifest.animations = animations;
    Ok(())
}

pub fn parse_sprite_pack_manifest(source: &str) -> Result<SpritePackManifest, PrepError> {
    let mut manifest: SpritePackManifest = serde_json::from_str(source)
        .map_err(|error| PrepError(format!("invalid sprite-pack.json: {error}")))?;
    if manifest.preset_file.is_some() {
        return Err(PrepError(
            "presetFile requires load_sprite_pack_manifest so relative paths can be resolved"
                .to_string(),
        ));
    }
    apply_manifest_preset(&mut manifest, None)?;
    expand_animation_grid(&mut manifest)?;
    validate_sprite_pack_manifest(manifest)
}

fn apply_manifest_preset(
    manifest: &mut SpritePackManifest,
    custom_preset: Option<&SpritePreset>,
) -> Result<(), PrepError> {
    if manifest.preset.is_some() && custom_preset.is_some() {
        return Err(PrepError(
            "sprite pack must use preset or presetFile, not both".to_string(),
        ));
    }
    let builtin;
    let preset = if let Some(custom) = custom_preset {
        Some(custom)
    } else if let Some(name) = manifest.preset.as_deref() {
        builtin = resolve_sprite_preset(name)?;
        Some(&builtin)
    } else {
        None
    };
    if let Some(preset) = preset {
        if manifest.profile.trim().is_empty() {
            manifest.profile = preset.profile.clone();
        }
        if manifest.width.is_none() && manifest.height.is_none() && manifest.profile == "free" {
            manifest.width = preset.frame_width;
            manifest.height = preset.frame_height;
        }
        if manifest.scene_actor_count.is_none() {
            manifest.scene_actor_count = Some(preset.scene_actor_count);
        }
        if manifest.collision_width.is_none() {
            manifest.collision_width = Some(preset.collision_width);
        }
        if manifest.collision_height.is_none() {
            manifest.collision_height = Some(preset.collision_height);
        }
    }
    Ok(())
}

fn validate_sprite_pack_manifest(
    manifest: SpritePackManifest,
) -> Result<SpritePackManifest, PrepError> {
    if !matches!(manifest.schema_version, 1 | 2) {
        return Err(PrepError(format!(
            "unsupported sprite pack schemaVersion {}; expected 1 or 2",
            manifest.schema_version
        )));
    }
    if manifest.name.trim().is_empty() || manifest.source.trim().is_empty() {
        return Err(PrepError(
            "sprite pack name and source cannot be empty".to_string(),
        ));
    }
    if manifest.animations.is_empty() {
        return Err(PrepError(
            "sprite pack requires at least one animation".to_string(),
        ));
    }
    if manifest.width.is_some() != manifest.height.is_some() {
        return Err(PrepError(
            "sprite pack width and height must be provided together".to_string(),
        ));
    }
    if manifest.scene_actor_count == Some(0)
        || manifest.collision_width == Some(0)
        || manifest.collision_height == Some(0)
    {
        return Err(PrepError(
            "sprite pack scene actors and collision dimensions must be greater than zero"
                .to_string(),
        ));
    }
    let profile = resolve_profile(&manifest.profile, manifest.width.zip(manifest.height))?;
    if manifest.layout.rows == Some(0) || manifest.layout.columns == Some(0) {
        return Err(PrepError(
            "sprite pack layout rows and columns must be greater than zero".to_string(),
        ));
    }
    match manifest.layout.mode {
        FrameLayoutMode::Auto => {
            if manifest.layout.rows.is_some() != manifest.layout.columns.is_some() {
                return Err(PrepError(
                    "automatic layout requires both rows and columns when either is provided"
                        .to_string(),
                ));
            }
        }
        FrameLayoutMode::Horizontal => {
            if manifest.layout.rows.is_some_and(|rows| rows != 1) {
                return Err(PrepError(
                    "horizontal layout must use exactly one row".to_string(),
                ));
            }
        }
        FrameLayoutMode::Vertical => {
            if manifest.layout.columns.is_some_and(|columns| columns != 1) {
                return Err(PrepError(
                    "vertical layout must use exactly one column".to_string(),
                ));
            }
        }
        FrameLayoutMode::Grid => {
            if manifest.layout.rows.is_none() || manifest.layout.columns.is_none() {
                return Err(PrepError(
                    "grid layout requires rows and columns".to_string(),
                ));
            }
        }
    }

    let allowed_states = [
        "idle", "walk", "move", "jump", "fall", "attack", "special", "guard", "hurt", "defeat",
    ];
    let allowed_directions = [
        "none",
        "up",
        "down",
        "left",
        "right",
        "up-left",
        "up-right",
        "down-left",
        "down-right",
    ];
    let racing_view_directions = ["view-down", "view-right", "view-up", "view-left"];
    let mut names = std::collections::BTreeSet::new();
    let mut mappings = std::collections::BTreeSet::new();
    for animation in &manifest.animations {
        let name = animation.name.trim();
        let state = animation.state.trim().to_lowercase();
        let direction = animation.direction.trim().to_lowercase().replace('_', "-");
        if name.is_empty() {
            return Err(PrepError("animation name cannot be empty".to_string()));
        }
        if !names.insert(name.to_string()) {
            return Err(PrepError(format!(
                "duplicate animation name '{name}' in sprite pack"
            )));
        }
        let directional_view = state == "directional_view";
        if !allowed_states.contains(&state.as_str())
            && !(profile.name == "racing" && directional_view)
        {
            return Err(PrepError(format!(
                "unsupported animation state '{}'; expected idle, walk, move, jump, fall, attack, special, guard, hurt or defeat{}",
                animation.state,
                if profile.name == "racing" {
                    " or directional_view"
                } else {
                    ""
                }
            )));
        }
        let direction_supported = if directional_view {
            racing_view_directions.contains(&direction.as_str())
        } else {
            allowed_directions.contains(&direction.as_str())
        };
        if !direction_supported {
            return Err(PrepError(format!(
                "unsupported animation direction '{}' for state '{}'",
                animation.direction, animation.state
            )));
        }
        if !mappings.insert((state, direction)) {
            return Err(PrepError(format!(
                "duplicate animation state/direction mapping for '{}/{}'",
                animation.state, animation.direction
            )));
        }
        if !(1..=60).contains(&animation.fps) {
            return Err(PrepError(format!(
                "animation '{}' fps must be between 1 and 60",
                animation.name
            )));
        }
        if animation.frames.is_empty() {
            return Err(PrepError(format!(
                "animation '{}' requires at least one frame",
                animation.name
            )));
        }
    }
    Ok(manifest)
}

pub fn load_sprite_pack_manifest(path: &Path) -> Result<SpritePackManifest, PrepError> {
    let source = std::fs::read_to_string(path).map_err(|error| {
        PrepError(format!(
            "failed to read sprite pack manifest '{}': {error}",
            path.display()
        ))
    })?;
    let mut manifest: SpritePackManifest = serde_json::from_str(&source)
        .map_err(|error| PrepError(format!("invalid sprite-pack.json: {error}")))?;
    let custom = if let Some(preset_file) = manifest.preset_file.as_deref() {
        let root = path.parent().unwrap_or_else(|| Path::new("."));
        Some(load_sprite_preset(&root.join(preset_file))?)
    } else {
        None
    };
    apply_manifest_preset(&mut manifest, custom.as_ref())?;
    expand_animation_grid(&mut manifest)?;
    validate_sprite_pack_manifest(manifest)
}

fn occupied_axis_segments(source: &RgbaImage, horizontal: bool) -> Vec<(u32, u32)> {
    let length = if horizontal {
        source.width()
    } else {
        source.height()
    };
    let occupied = (0..length)
        .map(|position| {
            if horizontal {
                (0..source.height()).any(|y| source.get_pixel(position, y)[3] >= 128)
            } else {
                (0..source.width()).any(|x| source.get_pixel(x, position)[3] >= 128)
            }
        })
        .collect::<Vec<_>>();
    let mut segments = Vec::new();
    let mut start = None;
    for (index, is_occupied) in occupied.into_iter().enumerate() {
        match (start, is_occupied) {
            (None, true) => start = Some(index as u32),
            (Some(segment_start), false) => {
                segments.push((segment_start, index as u32 - segment_start));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(segment_start) = start {
        segments.push((segment_start, length - segment_start));
    }
    segments
}

fn build_detection_report(
    source: &RgbaImage,
    strategy: &str,
    rows: usize,
    columns: usize,
    confidence: f32,
    rectangles: &[(u32, u32, u32, u32)],
) -> Result<(Vec<RgbaImage>, FrameDetectionReport), PrepError> {
    let mut frames = Vec::with_capacity(rectangles.len());
    let mut detected = Vec::with_capacity(rectangles.len());
    for (index, (x, y, width, height)) in rectangles.iter().copied().enumerate() {
        if width == 0
            || height == 0
            || x.checked_add(width)
                .is_none_or(|right| right > source.width())
            || y.checked_add(height)
                .is_none_or(|bottom| bottom > source.height())
        {
            return Err(PrepError(format!(
                "frame layout rectangle {index} exceeds the source image"
            )));
        }
        let frame = imageops::crop_imm(source, x, y, width, height).to_image();
        let duplicate_of = frames.iter().position(|candidate: &RgbaImage| {
            candidate.dimensions() == frame.dimensions() && candidate.as_raw() == frame.as_raw()
        });
        detected.push(DetectedFrame {
            index,
            row: index / columns,
            column: index % columns,
            source_x: x,
            source_y: y,
            source_width: width,
            source_height: height,
            empty: opaque_bounds(&frame).is_none(),
            duplicate_of,
            confidence,
        });
        frames.push(frame);
    }
    Ok((
        frames,
        FrameDetectionReport {
            strategy: strategy.to_string(),
            rows,
            columns,
            confidence,
            frames: detected,
        },
    ))
}

fn manual_frame_rectangles(
    source: &RgbaImage,
    rows: usize,
    columns: usize,
    margin: u32,
    spacing: u32,
) -> Result<Vec<(u32, u32, u32, u32)>, PrepError> {
    let rows_u32 = u32::try_from(rows)
        .map_err(|_| PrepError("frame layout rows exceed the supported range".to_string()))?;
    let columns_u32 = u32::try_from(columns)
        .map_err(|_| PrepError("frame layout columns exceed the supported range".to_string()))?;
    let cell_count = rows
        .checked_mul(columns)
        .ok_or_else(|| PrepError("frame layout cell count overflow".to_string()))?;
    let horizontal_gaps = spacing
        .checked_mul(columns_u32.saturating_sub(1))
        .and_then(|value| value.checked_add(margin.saturating_mul(2)))
        .ok_or_else(|| PrepError("frame layout horizontal spacing overflow".to_string()))?;
    let vertical_gaps = spacing
        .checked_mul(rows_u32.saturating_sub(1))
        .and_then(|value| value.checked_add(margin.saturating_mul(2)))
        .ok_or_else(|| PrepError("frame layout vertical spacing overflow".to_string()))?;
    let available_width = source.width().checked_sub(horizontal_gaps).ok_or_else(|| {
        PrepError("frame layout margin and spacing exceed the image width".to_string())
    })?;
    let available_height = source.height().checked_sub(vertical_gaps).ok_or_else(|| {
        PrepError("frame layout margin and spacing exceed the image height".to_string())
    })?;
    if available_width == 0
        || available_height == 0
        || !available_width.is_multiple_of(columns_u32)
        || !available_height.is_multiple_of(rows_u32)
    {
        return Err(PrepError(
            "frame layout does not divide the source image into equal cells".to_string(),
        ));
    }
    let frame_width = available_width / columns_u32;
    let frame_height = available_height / rows_u32;
    let mut rectangles = Vec::with_capacity(cell_count);
    for row in 0..rows {
        for column in 0..columns {
            rectangles.push((
                margin + column as u32 * (frame_width + spacing),
                margin + row as u32 * (frame_height + spacing),
                frame_width,
                frame_height,
            ));
        }
    }
    Ok(rectangles)
}

fn detect_source_frames(
    source: &RgbaImage,
    layout: &FrameLayoutSpec,
    required_frame_count: usize,
) -> Result<(Vec<RgbaImage>, FrameDetectionReport), PrepError> {
    if required_frame_count == 0 {
        return Err(PrepError(
            "frame layout requires at least one frame".to_string(),
        ));
    }
    if layout.mode == FrameLayoutMode::Auto {
        let horizontal = occupied_axis_segments(source, true);
        let vertical = occupied_axis_segments(source, false);
        if let (Some(rows), Some(columns)) = (layout.rows, layout.columns) {
            let cell_count = rows
                .checked_mul(columns)
                .ok_or_else(|| PrepError("frame layout cell count overflow".to_string()))?;
            if cell_count < required_frame_count {
                return Err(PrepError(format!(
                    "inferred frame layout provides {cell_count} cells but animations reference {required_frame_count} frames"
                )));
            }
            if horizontal.len() == columns && vertical.len() == rows {
                let rectangles = vertical
                    .iter()
                    .flat_map(|(y, height)| {
                        horizontal
                            .iter()
                            .map(move |(x, width)| (*x, *y, *width, *height))
                    })
                    .collect::<Vec<_>>();
                return build_detection_report(
                    source,
                    "auto-grid",
                    rows,
                    columns,
                    0.95,
                    &rectangles,
                );
            }
            let rectangles =
                manual_frame_rectangles(source, rows, columns, layout.margin, layout.spacing)?;
            return build_detection_report(
                source,
                "auto-grid-inferred",
                rows,
                columns,
                0.85,
                &rectangles,
            );
        }
        if !horizontal.is_empty()
            && !vertical.is_empty()
            && horizontal.len() * vertical.len() == required_frame_count
        {
            let rows = vertical.len();
            let columns = horizontal.len();
            let rectangles = vertical
                .iter()
                .flat_map(|(y, height)| {
                    horizontal
                        .iter()
                        .map(move |(x, width)| (*x, *y, *width, *height))
                })
                .collect::<Vec<_>>();
            let strategy = if rows > 1 && columns > 1 {
                "auto-grid"
            } else if columns > 1 {
                "auto-horizontal"
            } else {
                "auto-vertical"
            };
            return build_detection_report(source, strategy, rows, columns, 0.95, &rectangles);
        }

        let horizontal_fits = source.width().is_multiple_of(required_frame_count as u32);
        let vertical_fits = source.height().is_multiple_of(required_frame_count as u32);
        let (rows, columns, strategy) =
            if horizontal_fits && (!vertical_fits || source.width() >= source.height()) {
                (1, required_frame_count, "auto-horizontal")
            } else if vertical_fits {
                (required_frame_count, 1, "auto-vertical")
            } else {
                return Err(PrepError(
                    "automatic frame layout could not infer equal cells; provide rows and columns"
                        .to_string(),
                ));
            };
        let rectangles = manual_frame_rectangles(source, rows, columns, 0, 0)?;
        return build_detection_report(source, strategy, rows, columns, 0.65, &rectangles);
    }

    let (rows, columns, strategy) = match layout.mode {
        FrameLayoutMode::Horizontal => (
            1,
            layout.columns.unwrap_or(required_frame_count),
            "manual-horizontal",
        ),
        FrameLayoutMode::Vertical => (
            layout.rows.unwrap_or(required_frame_count),
            1,
            "manual-vertical",
        ),
        FrameLayoutMode::Grid => (
            layout.rows.expect("grid layout validated with rows"),
            layout.columns.expect("grid layout validated with columns"),
            "manual-grid",
        ),
        FrameLayoutMode::Auto => unreachable!(),
    };
    let cell_count = rows
        .checked_mul(columns)
        .ok_or_else(|| PrepError("frame layout cell count overflow".to_string()))?;
    if cell_count < required_frame_count {
        return Err(PrepError(format!(
            "frame layout provides {} cells but animations reference {required_frame_count} frames",
            cell_count
        )));
    }
    let rectangles = manual_frame_rectangles(source, rows, columns, layout.margin, layout.spacing)?;
    build_detection_report(source, strategy, rows, columns, 1.0, &rectangles)
}

fn sprite_pack_source_frame_count(manifest: &SpritePackManifest) -> Result<usize, PrepError> {
    manifest
        .animations
        .iter()
        .flat_map(|animation| animation.frames.iter().copied())
        .max()
        .map(|index| index + 1)
        .ok_or_else(|| PrepError("sprite pack requires at least one frame".to_string()))
}

fn gba_rgb555(pixel: Rgba<u8>) -> u16 {
    ((u16::from(pixel[0]) >> 3) << 10)
        | ((u16::from(pixel[1]) >> 3) << 5)
        | (u16::from(pixel[2]) >> 3)
}

fn has_non_transparent_gutter(source: &RgbaImage, detection: &FrameDetectionReport) -> bool {
    for y in 0..source.height() {
        for x in 0..source.width() {
            if source.get_pixel(x, y)[3] == 0 {
                continue;
            }
            let is_in_frame = detection.frames.iter().any(|frame| {
                x >= frame.source_x
                    && x < frame.source_x + frame.source_width
                    && y >= frame.source_y
                    && y < frame.source_y + frame.source_height
            });
            if !is_in_frame {
                return true;
            }
        }
    }
    false
}

/// Audits a source before any sprite reconstruction happens.
///
/// A passing audit means the source can be reduced only by exact integer nearest
/// scaling and represented by the current single 4 BPP OBJ palette contract.
pub fn audit_sprite_source(
    source: &RgbaImage,
    manifest: &SpritePackManifest,
) -> Result<SpriteSourceAudit, PrepError> {
    let profile = resolve_profile(&manifest.profile, manifest.width.zip(manifest.height))?;
    let expected_frame_count = sprite_pack_source_frame_count(manifest)?;
    let mut transparent_pixels = 0u64;
    let mut opaque_pixels = 0u64;
    let mut partial_alpha_pixels = 0u64;
    let mut visible_colors = BTreeSet::new();

    for pixel in source.pixels().copied() {
        match pixel[3] {
            0 => transparent_pixels += 1,
            255 => opaque_pixels += 1,
            _ => partial_alpha_pixels += 1,
        }
        if pixel[3] != 0 {
            visible_colors.insert(gba_rgb555(pixel));
        }
    }

    let mut violations = Vec::new();
    if partial_alpha_pixels > 0 {
        violations.push("partial-alpha".to_string());
    }
    if visible_colors.len() > profile.max_visible_colors {
        violations.push("visible-colors-exceed-4bpp".to_string());
    }

    let (frame_count, integer_scale) =
        match detect_source_frames(source, &manifest.layout, expected_frame_count) {
            Ok((frames, detection)) => {
                if has_non_transparent_gutter(source, &detection) {
                    violations.push("non-transparent-gutter".to_string());
                }

                let scales = frames
                    .iter()
                    .map(|frame| {
                        if !frame.width().is_multiple_of(profile.frame_width)
                            || !frame.height().is_multiple_of(profile.frame_height)
                        {
                            return None;
                        }
                        let horizontal = frame.width() / profile.frame_width;
                        let vertical = frame.height() / profile.frame_height;
                        (horizontal == vertical && horizontal > 0).then_some(horizontal)
                    })
                    .collect::<Vec<_>>();
                let integer_scale = scales.first().copied().flatten().filter(|scale| {
                    scales
                        .iter()
                        .all(|candidate| candidate.is_some_and(|value| value == *scale))
                });
                if integer_scale.is_none() {
                    violations.push("non-uniform-integer-scale".to_string());
                }
                (frames.len(), integer_scale)
            }
            Err(_) => {
                violations.push("invalid-equal-frame-grid".to_string());
                (0, None)
            }
        };

    Ok(SpriteSourceAudit {
        source_width: source.width(),
        source_height: source.height(),
        frame_count,
        frame_width: profile.frame_width,
        frame_height: profile.frame_height,
        integer_scale,
        transparent_pixels,
        opaque_pixels,
        partial_alpha_pixels,
        visible_colors: visible_colors.len(),
        max_visible_colors: profile.max_visible_colors,
        passed: violations.is_empty(),
        violations,
    })
}

fn clear_connected_matte(source: &mut RgbaImage, matte: CandidateMatte) -> u64 {
    let width = source.width();
    let height = source.height();
    if width == 0 || height == 0 {
        return 0;
    }

    let mut queued = vec![false; (width * height) as usize];
    let mut queue = VecDeque::new();
    let enqueue = |x: u32,
                   y: u32,
                   queued: &mut Vec<bool>,
                   queue: &mut VecDeque<(u32, u32)>,
                   source: &RgbaImage| {
        let index = (y * width + x) as usize;
        if !queued[index] && matte.matches(*source.get_pixel(x, y)) {
            queued[index] = true;
            queue.push_back((x, y));
        }
    };

    for x in 0..width {
        enqueue(x, 0, &mut queued, &mut queue, source);
        enqueue(x, height - 1, &mut queued, &mut queue, source);
    }
    for y in 1..height.saturating_sub(1) {
        enqueue(0, y, &mut queued, &mut queue, source);
        enqueue(width - 1, y, &mut queued, &mut queue, source);
    }

    let mut cleared = 0u64;
    while let Some((x, y)) = queue.pop_front() {
        source.put_pixel(x, y, Rgba([0, 0, 0, 0]));
        cleared += 1;
        for (next_x, next_y) in [
            (x.checked_sub(1), Some(y)),
            (x.checked_add(1).filter(|next| *next < width), Some(y)),
            (Some(x), y.checked_sub(1)),
            (Some(x), y.checked_add(1).filter(|next| *next < height)),
        ] {
            if let (Some(next_x), Some(next_y)) = (next_x, next_y) {
                enqueue(next_x, next_y, &mut queued, &mut queue, source);
            }
        }
    }

    cleared
}

fn visible_rgb555_colors(image: &RgbaImage) -> usize {
    image
        .pixels()
        .filter(|pixel| pixel[3] != 0)
        .map(|pixel| gba_rgb555(*pixel))
        .collect::<BTreeSet<_>>()
        .len()
}

/// Stages approved artwork from an image-generation preview without using the
/// legacy auto-crop/recenter path. The caller declares every source region,
/// then each region is resized with nearest-neighbor onto its final cell.
///
/// The preview's light checkerboard matte is removed only when connected to
/// the outer edge. Palette reduction is opt-in, so visual approval of the
/// staged 1x source happens before the 4 BPP palette is selected.
pub fn stage_candidate_frames(
    source: &RgbaImage,
    regions: &[CandidateFrameRegion],
    target_size: (u32, u32),
    matte: CandidateMatte,
    palette_policy: CandidatePalettePolicy,
) -> Result<(RgbaImage, CandidateStageReport), PrepError> {
    if regions.is_empty() {
        return Err(PrepError(
            "candidate staging requires at least one frame region".to_string(),
        ));
    }
    if target_size.0 == 0 || target_size.1 == 0 {
        return Err(PrepError(
            "candidate staging target dimensions must be positive".to_string(),
        ));
    }
    let mut transparent_source = source.clone();
    let cleared_matte_pixels = clear_connected_matte(&mut transparent_source, matte);
    let output_width = target_size
        .0
        .checked_mul(regions.len() as u32)
        .ok_or_else(|| PrepError("candidate staging sheet is too wide".to_string()))?;
    let mut sheet = RgbaImage::new(output_width, target_size.1);

    for (index, region) in regions.iter().enumerate() {
        if region.width == 0
            || region.height == 0
            || region
                .x
                .checked_add(region.width)
                .is_none_or(|right| right > transparent_source.width())
            || region
                .y
                .checked_add(region.height)
                .is_none_or(|bottom| bottom > transparent_source.height())
        {
            return Err(PrepError(format!(
                "candidate frame region {index} is outside the source image"
            )));
        }
        let cropped = imageops::crop_imm(
            &transparent_source,
            region.x,
            region.y,
            region.width,
            region.height,
        )
        .to_image();
        let resized = imageops::resize(
            &cropped,
            target_size.0,
            target_size.1,
            imageops::FilterType::Nearest,
        );
        imageops::overlay(
            &mut sheet,
            &resized,
            (index as u32 * target_size.0).into(),
            0,
        );
    }

    let visible_colors_before_palette = visible_rgb555_colors(&sheet);
    let palette_reduced = matches!(palette_policy, CandidatePalettePolicy::ReduceTo4Bpp);
    let visible_colors = if palette_reduced {
        quantize_gba_palette(&mut sheet, 15)
    } else {
        visible_colors_before_palette
    };
    Ok((
        sheet,
        CandidateStageReport {
            frame_count: regions.len(),
            frame_width: target_size.0,
            frame_height: target_size.1,
            cleared_matte_pixels,
            visible_colors_before_palette,
            visible_colors,
            max_visible_colors: 15,
            palette_reduced,
        },
    ))
}

fn validate_sprite_source_contract(
    source: &RgbaImage,
    manifest: &SpritePackManifest,
) -> Result<Option<SpriteSourceAudit>, PrepError> {
    let Some(contract) = manifest.source_contract else {
        return Ok(None);
    };
    let audit = audit_sprite_source(source, manifest)?;
    if !audit.passed {
        return Err(PrepError(format!(
            "sourceContract '{contract:?}' rejected the source: {}",
            audit.violations.join(", ")
        )));
    }
    Ok(Some(audit))
}

pub fn prepare_sprite_pack(
    source: &RgbaImage,
    manifest: &SpritePackManifest,
    snap: bool,
    pixel_size_override: Option<f64>,
) -> Result<PreparedSpritePack, PrepError> {
    let profile = resolve_profile(&manifest.profile, manifest.width.zip(manifest.height))?;
    validate_sprite_source_contract(source, manifest)?;
    let source_frame_count = sprite_pack_source_frame_count(manifest)?;
    let (source_frames, detection) =
        detect_source_frames(source, &manifest.layout, source_frame_count)?;
    let mut selected_frames = Vec::new();
    for animation in &manifest.animations {
        for frame_index in &animation.frames {
            let frame = source_frames.get(*frame_index).ok_or_else(|| {
                PrepError(format!(
                    "animation '{}' references missing frame {}",
                    animation.name, frame_index
                ))
            })?;
            selected_frames.push(frame.clone());
        }
    }
    let selected_frames = if manifest.source_contract.is_none() && snap {
        snap_frames_with_spritefusion_for_target(
            &selected_frames,
            profile.max_visible_colors,
            pixel_size_override,
            (profile.frame_width, profile.frame_height),
        )?
    } else {
        selected_frames
    };
    let (sheet, report) = if manifest.source_contract.is_some() {
        prepare_native_frames(&selected_frames, &profile)?
    } else {
        prepare_frames(&selected_frames, &profile)?
    };
    let sprite_sheet = format!("{}.png", identifier(&manifest.name));
    let mut animations = Vec::with_capacity(manifest.animations.len());
    let mut output_offset = 0usize;
    for animation in &manifest.animations {
        let mut metadata = build_animation_metadata(
            &sprite_sheet,
            &profile,
            animation.frames.len(),
            &AnimationOptions {
                name: animation.name.clone(),
                state: animation.state.clone(),
                direction: animation.direction.clone(),
                fps: animation.fps,
                loops: animation.loops,
            },
        )?;
        for frame in &mut metadata.frames {
            frame.source_frame_index = animation.frames[frame.frame_index];
            for tile in &mut frame.tiles {
                tile.slice_x += output_offset as u32 * profile.frame_width;
            }
        }
        output_offset += animation.frames.len();
        animations.push(metadata);
    }
    Ok(PreparedSpritePack {
        sheet,
        report,
        animations,
        detection,
    })
}

pub fn resolve_profile(
    name: &str,
    custom_size: Option<(u32, u32)>,
) -> Result<SpriteProfile, PrepError> {
    let normalized = name.trim().to_lowercase().replace([' ', '_', '-'], "");
    let (canonical_name, frame_width, frame_height, anchor) = match normalized.as_str() {
        "topdown" | "aventura" => ("topdown", 16, 16, Anchor::BottomCenter),
        "topdowntall" | "aventuraalta" => ("topdown-tall", 16, 32, Anchor::BottomCenter),
        "platformer" | "plataforma" => ("platformer", 16, 32, Anchor::BottomCenter),
        "platformerwide" | "plataformalarga" => ("platformer-wide", 32, 32, Anchor::BottomCenter),
        "isometric" | "isometrico" | "isométrico" => ("isometric", 32, 32, Anchor::BottomCenter),
        "dungeoncrawler" => ("dungeon-crawler", 64, 64, Anchor::Center),
        "racing" | "corrida" => ("racing", 32, 32, Anchor::Center),
        "pointandclick" | "apontareclicar" => ("point-and-click", 16, 32, Anchor::BottomCenter),
        "shmup" | "shootemup" => ("shmup", 32, 32, Anchor::Center),
        "shmuplarge" | "shootemuplarge" => ("shmup-large", 64, 64, Anchor::Center),
        "shmupeffect" | "shmupfx" => {
            let (width, height) = custom_size.ok_or_else(|| {
                PrepError("shmup-effect profile requires width and height".to_string())
            })?;
            validate_free_canvas(width, height)?;
            ("shmup-effect", width, height, Anchor::Center)
        }
        "visualnovel" => ("visual-novel", 64, 64, Anchor::BottomCenter),
        "menu" | "ui" => ("menu", 16, 16, Anchor::Center),
        "cutscene" => ("cutscene", 32, 32, Anchor::BottomCenter),
        "worldmap" | "mapamundial" => ("world-map", 16, 16, Anchor::Center),
        "battlerpg" | "batalharpg" => ("battle-rpg", 64, 64, Anchor::BottomCenter),
        "free" | "custom" | "livre" => {
            let (width, height) = custom_size.ok_or_else(|| {
                PrepError("free profile requires --width and --height".to_string())
            })?;
            validate_free_canvas(width, height)?;
            ("free", width, height, Anchor::BottomCenter)
        }
        _ => return Err(PrepError(format!("unknown sprite profile '{name}'"))),
    };

    Ok(SpriteProfile {
        name: canonical_name.to_string(),
        frame_width,
        frame_height,
        anchor,
        max_visible_colors: 15,
        current_exporter_compatible: minimum_hardware_objects(frame_width, frame_height) <= 4,
    })
}

pub fn prepare_frames(
    frames: &[RgbaImage],
    profile: &SpriteProfile,
) -> Result<(RgbaImage, PreparationReport), PrepError> {
    if frames.is_empty() {
        return Err(PrepError("at least one frame is required".to_string()));
    }
    if frames
        .iter()
        .any(|frame| frame.width() == 0 || frame.height() == 0)
    {
        return Err(PrepError("frame dimensions cannot be zero".to_string()));
    }

    let bounds: Vec<Option<PixelBounds>> = frames.iter().map(opaque_bounds).collect();
    let max_content_width = bounds
        .iter()
        .flatten()
        .map(|bound| bound.width)
        .max()
        .unwrap_or(1);
    let max_content_height = bounds
        .iter()
        .flatten()
        .map(|bound| bound.height)
        .max()
        .unwrap_or(1);
    let scale = shared_scale(
        max_content_width,
        max_content_height,
        profile.frame_width,
        profile.frame_height,
    );

    let sheet_width = profile
        .frame_width
        .checked_mul(frames.len() as u32)
        .ok_or_else(|| PrepError("output spritesheet is too wide".to_string()))?;
    let mut sheet = RgbaImage::new(sheet_width, profile.frame_height);

    for (index, (frame, bound)) in frames.iter().zip(bounds.iter()).enumerate() {
        let Some(bound) = bound else {
            continue;
        };
        let cropped =
            imageops::crop_imm(frame, bound.x, bound.y, bound.width, bound.height).to_image();
        let resized_width = scaled_dimension(bound.width, scale, profile.frame_width);
        let resized_height = scaled_dimension(bound.height, scale, profile.frame_height);
        let resized = imageops::resize(
            &cropped,
            resized_width,
            resized_height,
            imageops::FilterType::Nearest,
        );
        let (anchor_x, anchor_y) = anchor_position(
            profile.anchor,
            profile.frame_width,
            profile.frame_height,
            resized_width,
            resized_height,
        );
        let frame_x = index as u32 * profile.frame_width + anchor_x;
        imageops::overlay(&mut sheet, &resized, frame_x.into(), anchor_y.into());
    }

    let report = report_prepared_sheet(&mut sheet, profile, frames.len());
    Ok((sheet, report))
}

fn report_prepared_sheet(
    sheet: &mut RgbaImage,
    profile: &SpriteProfile,
    frame_count: usize,
) -> PreparationReport {
    let visible_colors = quantize_gba_palette(sheet, profile.max_visible_colors);
    let tiles_per_frame = profile.frame_width / 8 * (profile.frame_height / 8);
    let bytes_per_frame_4bpp = profile.frame_width * profile.frame_height / 2;
    let hardware_objects_per_frame =
        minimum_hardware_objects(profile.frame_width, profile.frame_height);
    let current_runtime_objects_per_frame = hardware_objects_per_frame;
    let warnings = profile_warnings(profile, hardware_objects_per_frame);
    PreparationReport {
        profile: profile.clone(),
        frame_count,
        output_width: sheet.width(),
        output_height: sheet.height(),
        visible_colors,
        tiles_per_frame,
        bytes_per_frame_4bpp,
        animation_bytes_4bpp: bytes_per_frame_4bpp * frame_count as u32,
        hardware_objects_per_frame,
        current_runtime_objects_per_frame,
        warnings,
    }
}

fn prepare_native_frames(
    frames: &[RgbaImage],
    profile: &SpriteProfile,
) -> Result<(RgbaImage, PreparationReport), PrepError> {
    if frames.is_empty() {
        return Err(PrepError("at least one frame is required".to_string()));
    }
    let sheet_width = profile
        .frame_width
        .checked_mul(frames.len() as u32)
        .ok_or_else(|| PrepError("output spritesheet is too wide".to_string()))?;
    let mut sheet = RgbaImage::new(sheet_width, profile.frame_height);
    for (index, frame) in frames.iter().enumerate() {
        if !frame.width().is_multiple_of(profile.frame_width)
            || !frame.height().is_multiple_of(profile.frame_height)
            || frame.width() / profile.frame_width != frame.height() / profile.frame_height
        {
            return Err(PrepError(
                "gba-native source frames must be equal integer multiples of the target canvas"
                    .to_string(),
            ));
        }
        let resized = imageops::resize(
            frame,
            profile.frame_width,
            profile.frame_height,
            imageops::FilterType::Nearest,
        );
        imageops::overlay(
            &mut sheet,
            &resized,
            (index as u32 * profile.frame_width).into(),
            0,
        );
    }
    let report = report_prepared_sheet(&mut sheet, profile, frames.len());
    Ok((sheet, report))
}

pub fn build_animation_metadata(
    sprite_sheet: &str,
    profile: &SpriteProfile,
    frame_count: usize,
    options: &AnimationOptions,
) -> Result<AnimationMetadata, PrepError> {
    if sprite_sheet.trim().is_empty() {
        return Err(PrepError("sprite sheet name cannot be empty".to_string()));
    }
    if frame_count == 0 {
        return Err(PrepError(
            "animation requires at least one frame".to_string(),
        ));
    }
    if options.name.trim().is_empty()
        || options.state.trim().is_empty()
        || options.direction.trim().is_empty()
    {
        return Err(PrepError(
            "animation name, state and direction cannot be empty".to_string(),
        ));
    }
    if !(1..=60).contains(&options.fps) {
        return Err(PrepError(
            "animation fps must be between 1 and 60".to_string(),
        ));
    }

    let sprite_sheet = sprite_sheet.to_string();
    let object_parts = hardware_object_layout(profile.frame_width, profile.frame_height);
    let frames = (0..frame_count)
        .map(|frame_index| AnimationFrameMetadata {
            frame_index,
            source_frame_index: frame_index,
            width: profile.frame_width,
            height: profile.frame_height,
            origin_x: profile.frame_width / 2,
            origin_y: match profile.anchor {
                Anchor::BottomCenter => profile.frame_height,
                Anchor::Center => profile.frame_height / 2,
            },
            tiles: object_parts
                .iter()
                .map(|part| AnimationTileMetadata {
                    x: part.x as i32,
                    y: part.y as i32,
                    slice_x: frame_index as u32 * profile.frame_width + part.x,
                    slice_y: part.y,
                    source_sheet: sprite_sheet.clone(),
                    tile_width: part.width,
                    tile_height: part.height,
                    flip_x: false,
                    flip_y: false,
                    obj_palette: "OBP0".to_string(),
                    palette_index: 0,
                    priority: false,
                })
                .collect(),
        })
        .collect();

    Ok(AnimationMetadata {
        id: format!("animation-{}", identifier(&options.name)),
        name: options.name.trim().to_string(),
        sprite_sheet,
        frame_width: profile.frame_width,
        frame_height: profile.frame_height,
        fps: options.fps,
        loops: options.loops,
        frame_count,
        state: options.state.trim().to_string(),
        direction: options.direction.trim().to_string(),
        color_mode: "4bpp".to_string(),
        frames,
    })
}

pub fn import_prepared_sprite_into_project(
    project: &mut Value,
    metadata: &AnimationMetadata,
    asset_source: &str,
    actor_selector: Option<&str>,
) -> Result<ProjectImportResult, PrepError> {
    let source_path = Path::new(asset_source);
    let source_file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| PrepError("asset source requires a UTF-8 file name".to_string()))?;
    if source_file_name != metadata.sprite_sheet {
        return Err(PrepError(format!(
            "asset source file '{source_file_name}' does not match metadata sprite sheet '{}'",
            metadata.sprite_sheet
        )));
    }

    let data = match project.get_mut("data") {
        Some(Value::Object(data)) => data,
        _ => project
            .as_object_mut()
            .ok_or_else(|| PrepError("project root must be a JSON object".to_string()))?,
    };
    let asset_id = format!("asset-{}", identifier(source_file_name));
    let asset = json!({
        "id": asset_id,
        "name": source_file_name,
        "kind": "Sprite",
        "systemImage": "figure.walk",
        "metadata": {
            "source": asset_source,
            "generatedBy": "gba-sprite-prep"
        }
    });
    upsert_project_entry(data, "assets", &asset, &asset_id, source_file_name)?;

    let animation = serde_json::to_value(metadata)
        .map_err(|error| PrepError(format!("failed to encode animation metadata: {error}")))?;
    upsert_project_animation(data, &animation, metadata)?;

    let actor_id = if let Some(selector) = actor_selector {
        let actors = project_array_mut(data, "actors")?;
        let actor = actors
            .iter_mut()
            .find(|actor| {
                actor.get("id").and_then(Value::as_str) == Some(selector)
                    || actor.get("name").and_then(Value::as_str) == Some(selector)
            })
            .ok_or_else(|| PrepError(format!("actor '{selector}' was not found in the project")))?;
        let actor_object = actor
            .as_object_mut()
            .ok_or_else(|| PrepError("project actor must be a JSON object".to_string()))?;
        actor_object.insert(
            "spriteSheet".to_string(),
            Value::String(metadata.sprite_sheet.clone()),
        );
        actor_object.insert(
            "animationName".to_string(),
            Value::String(metadata.name.clone()),
        );
        Some(
            actor_object
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or(selector)
                .to_string(),
        )
    } else {
        None
    };

    Ok(ProjectImportResult {
        asset_id,
        animation_id: metadata.id.clone(),
        actor_id,
    })
}

pub fn import_prepared_sprite_pack_into_project(
    project: &mut Value,
    animations: &[AnimationMetadata],
    asset_source: &str,
    actor_selector: Option<&str>,
) -> Result<SpritePackImportResult, PrepError> {
    let first = animations
        .first()
        .ok_or_else(|| PrepError("sprite pack requires at least one animation".to_string()))?;
    if animations
        .iter()
        .any(|animation| animation.sprite_sheet != first.sprite_sheet)
    {
        return Err(PrepError(
            "every animation in a sprite pack must use the same sprite sheet".to_string(),
        ));
    }

    let first_result =
        import_prepared_sprite_into_project(project, first, asset_source, actor_selector)?;
    let mut animation_ids = vec![first_result.animation_id.clone()];
    for animation in animations.iter().skip(1) {
        let result = import_prepared_sprite_into_project(project, animation, asset_source, None)?;
        animation_ids.push(result.animation_id);
    }

    Ok(SpritePackImportResult {
        asset_id: first_result.asset_id,
        animation_ids,
        actor_id: first_result.actor_id,
    })
}

pub fn materialize_project_copy(
    source_project: &Path,
    destination_project: &Path,
    prepared_png: &Path,
    metadata: &AnimationMetadata,
    actor_selector: Option<&str>,
) -> Result<ProjectImportResult, PrepError> {
    if source_project == destination_project {
        return Err(PrepError(
            "source and destination project paths must be different".to_string(),
        ));
    }
    if !prepared_png.is_file() {
        return Err(PrepError(format!(
            "prepared PNG does not exist: {}",
            prepared_png.display()
        )));
    }
    let source_root = source_project
        .parent()
        .ok_or_else(|| PrepError("source project requires a parent directory".to_string()))?;
    let destination_root = destination_project
        .parent()
        .ok_or_else(|| PrepError("destination project requires a parent directory".to_string()))?;
    std::fs::create_dir_all(destination_root).map_err(|error| {
        PrepError(format!(
            "failed to create destination project directory: {error}"
        ))
    })?;
    let source_root_canonical = source_root.canonicalize().map_err(|error| {
        PrepError(format!(
            "failed to resolve source project directory '{}': {error}",
            source_root.display()
        ))
    })?;
    let destination_root_canonical = destination_root.canonicalize().map_err(|error| {
        PrepError(format!(
            "failed to resolve destination project directory '{}': {error}",
            destination_root.display()
        ))
    })?;
    if source_root_canonical == destination_root_canonical {
        return Err(PrepError(
            "destination project must use a different directory so the source stays untouched"
                .to_string(),
        ));
    }

    let project_bytes = std::fs::read(source_project).map_err(|error| {
        PrepError(format!(
            "failed to read source project '{}': {error}",
            source_project.display()
        ))
    })?;
    let mut project: Value = serde_json::from_slice(&project_bytes)
        .map_err(|error| PrepError(format!("failed to parse source project JSON: {error}")))?;
    let asset_source = format!("Assets/sprites/{}", metadata.sprite_sheet);
    let import_result =
        import_prepared_sprite_into_project(&mut project, metadata, &asset_source, actor_selector)?;

    let source_assets = source_root.join("Assets");
    let destination_assets = destination_root.join("Assets");
    if source_assets.is_dir() {
        copy_directory_tree(&source_assets, &destination_assets)?;
    }
    let destination_sprite = destination_assets
        .join("sprites")
        .join(&metadata.sprite_sheet);
    if let Some(parent) = destination_sprite.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            PrepError(format!(
                "failed to create destination sprite directory: {error}"
            ))
        })?;
    }
    std::fs::copy(prepared_png, &destination_sprite).map_err(|error| {
        PrepError(format!(
            "failed to copy prepared sprite to '{}': {error}",
            destination_sprite.display()
        ))
    })?;
    let destination_json = serde_json::to_vec_pretty(&project)
        .map_err(|error| PrepError(format!("failed to serialize destination project: {error}")))?;
    std::fs::write(destination_project, destination_json).map_err(|error| {
        PrepError(format!(
            "failed to write destination project '{}': {error}",
            destination_project.display()
        ))
    })?;
    Ok(import_result)
}

pub fn materialize_project_pack_copy(
    source_project: &Path,
    destination_project: &Path,
    prepared_png: &Path,
    animations: &[AnimationMetadata],
    actor_selector: Option<&str>,
) -> Result<SpritePackImportResult, PrepError> {
    if source_project == destination_project {
        return Err(PrepError(
            "source and destination project paths must be different".to_string(),
        ));
    }
    if !prepared_png.is_file() {
        return Err(PrepError(format!(
            "prepared PNG does not exist: {}",
            prepared_png.display()
        )));
    }
    let first = animations
        .first()
        .ok_or_else(|| PrepError("sprite pack requires at least one animation".to_string()))?;
    if animations
        .iter()
        .any(|animation| animation.sprite_sheet != first.sprite_sheet)
    {
        return Err(PrepError(
            "every animation in a sprite pack must use the same sprite sheet".to_string(),
        ));
    }

    let source_root = source_project
        .parent()
        .ok_or_else(|| PrepError("source project requires a parent directory".to_string()))?;
    let destination_root = destination_project
        .parent()
        .ok_or_else(|| PrepError("destination project requires a parent directory".to_string()))?;
    std::fs::create_dir_all(destination_root).map_err(|error| {
        PrepError(format!(
            "failed to create destination project directory: {error}"
        ))
    })?;
    let source_root_canonical = source_root.canonicalize().map_err(|error| {
        PrepError(format!(
            "failed to resolve source project directory '{}': {error}",
            source_root.display()
        ))
    })?;
    let destination_root_canonical = destination_root.canonicalize().map_err(|error| {
        PrepError(format!(
            "failed to resolve destination project directory '{}': {error}",
            destination_root.display()
        ))
    })?;
    if source_root_canonical == destination_root_canonical {
        return Err(PrepError(
            "destination project must use a different directory so the source stays untouched"
                .to_string(),
        ));
    }

    let project_bytes = std::fs::read(source_project).map_err(|error| {
        PrepError(format!(
            "failed to read source project '{}': {error}",
            source_project.display()
        ))
    })?;
    let mut project: Value = serde_json::from_slice(&project_bytes)
        .map_err(|error| PrepError(format!("failed to parse source project JSON: {error}")))?;
    let asset_source = format!("Assets/sprites/{}", first.sprite_sheet);
    let import_result = import_prepared_sprite_pack_into_project(
        &mut project,
        animations,
        &asset_source,
        actor_selector,
    )?;

    let source_assets = source_root.join("Assets");
    let destination_assets = destination_root.join("Assets");
    if source_assets.is_dir() {
        copy_directory_tree(&source_assets, &destination_assets)?;
    }
    let destination_sprite = destination_assets.join("sprites").join(&first.sprite_sheet);
    if let Some(parent) = destination_sprite.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            PrepError(format!(
                "failed to create destination sprite directory: {error}"
            ))
        })?;
    }
    std::fs::copy(prepared_png, &destination_sprite).map_err(|error| {
        PrepError(format!(
            "failed to copy prepared sprite to '{}': {error}",
            destination_sprite.display()
        ))
    })?;
    let destination_json = serde_json::to_vec_pretty(&project)
        .map_err(|error| PrepError(format!("failed to serialize destination project: {error}")))?;
    std::fs::write(destination_project, destination_json).map_err(|error| {
        PrepError(format!(
            "failed to write destination project '{}': {error}",
            destination_project.display()
        ))
    })?;
    Ok(import_result)
}

fn copy_directory_tree(source: &Path, destination: &Path) -> Result<(), PrepError> {
    std::fs::create_dir_all(destination).map_err(|error| {
        PrepError(format!(
            "failed to create copied asset directory '{}': {error}",
            destination.display()
        ))
    })?;
    let entries = std::fs::read_dir(source).map_err(|error| {
        PrepError(format!(
            "failed to enumerate asset directory '{}': {error}",
            source.display()
        ))
    })?;
    for entry in entries {
        let entry = entry.map_err(|error| PrepError(format!("failed to read asset: {error}")))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|error| PrepError(format!("failed to inspect asset: {error}")))?;
        if file_type.is_dir() {
            copy_directory_tree(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &destination_path).map_err(|error| {
                PrepError(format!(
                    "failed to copy asset '{}' to '{}': {error}",
                    source_path.display(),
                    destination_path.display()
                ))
            })?;
        }
    }
    Ok(())
}

fn project_array_mut<'a>(
    data: &'a mut serde_json::Map<String, Value>,
    field: &str,
) -> Result<&'a mut Vec<Value>, PrepError> {
    data.entry(field.to_string())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| PrepError(format!("project field '{field}' must be an array")))
}

fn upsert_project_entry(
    data: &mut serde_json::Map<String, Value>,
    field: &str,
    entry: &Value,
    id: &str,
    name: &str,
) -> Result<(), PrepError> {
    let entries = project_array_mut(data, field)?;
    if let Some(existing) = entries.iter_mut().find(|candidate| {
        candidate.get("id").and_then(Value::as_str) == Some(id)
            || candidate.get("name").and_then(Value::as_str) == Some(name)
    }) {
        *existing = entry.clone();
    } else {
        entries.push(entry.clone());
    }
    Ok(())
}

fn upsert_project_animation(
    data: &mut serde_json::Map<String, Value>,
    animation: &Value,
    metadata: &AnimationMetadata,
) -> Result<(), PrepError> {
    let entries = project_array_mut(data, "animations")?;
    if let Some(existing) = entries.iter_mut().find(|candidate| {
        candidate.get("id").and_then(Value::as_str) == Some(metadata.id.as_str())
            || (candidate.get("name").and_then(Value::as_str) == Some(metadata.name.as_str())
                && candidate.get("spriteSheet").and_then(Value::as_str)
                    == Some(metadata.sprite_sheet.as_str()))
    }) {
        *existing = animation.clone();
    } else {
        entries.push(animation.clone());
    }
    Ok(())
}

pub fn render_preview_sheet(
    sheet: &RgbaImage,
    profile: &SpriteProfile,
    scale: u32,
) -> Result<RgbaImage, PrepError> {
    if scale == 0 || scale > 32 {
        return Err(PrepError(
            "preview scale must be between 1 and 32".to_string(),
        ));
    }
    if sheet.height() != profile.frame_height || !sheet.width().is_multiple_of(profile.frame_width)
    {
        return Err(PrepError(
            "prepared sheet dimensions do not match the sprite profile".to_string(),
        ));
    }
    let width = sheet
        .width()
        .checked_mul(scale)
        .ok_or_else(|| PrepError("preview width overflow".to_string()))?;
    let height = sheet
        .height()
        .checked_mul(scale)
        .ok_or_else(|| PrepError("preview height overflow".to_string()))?;
    let mut preview = RgbaImage::from_fn(width, height, |x, y| {
        let checker = ((x / (scale * 2)) + (y / (scale * 2))) % 2;
        if checker == 0 {
            Rgba([48, 48, 56, 255])
        } else {
            Rgba([72, 72, 80, 255])
        }
    });
    let enlarged = imageops::resize(sheet, width, height, imageops::FilterType::Nearest);
    imageops::overlay(&mut preview, &enlarged, 0, 0);
    Ok(preview)
}

pub fn split_horizontal_frames(
    source: &RgbaImage,
    frame_count: usize,
) -> Result<Vec<RgbaImage>, PrepError> {
    if frame_count == 0 {
        return Err(PrepError(
            "frame count must be greater than zero".to_string(),
        ));
    }
    if !source.width().is_multiple_of(frame_count as u32) {
        return Err(PrepError(format!(
            "source width {} is not divisible by frame count {frame_count}",
            source.width()
        )));
    }
    let frame_width = source.width() / frame_count as u32;
    if frame_width == 0 {
        return Err(PrepError(
            "source frames cannot have zero width".to_string(),
        ));
    }

    Ok((0..frame_count)
        .map(|index| {
            imageops::crop_imm(
                source,
                index as u32 * frame_width,
                0,
                frame_width,
                source.height(),
            )
            .to_image()
        })
        .collect())
}

pub fn snap_frames_with_spritefusion(
    frames: &[RgbaImage],
    max_visible_colors: usize,
    pixel_size_override: Option<f64>,
) -> Result<Vec<RgbaImage>, PrepError> {
    snap_frames_with_spritefusion_internal(frames, max_visible_colors, pixel_size_override, None)
}

pub fn snap_frames_with_spritefusion_for_target(
    frames: &[RgbaImage],
    max_visible_colors: usize,
    pixel_size_override: Option<f64>,
    target_frame_size: (u32, u32),
) -> Result<Vec<RgbaImage>, PrepError> {
    if target_frame_size.0 == 0 || target_frame_size.1 == 0 {
        return Err(PrepError(
            "target frame dimensions cannot be zero".to_string(),
        ));
    }
    snap_frames_with_spritefusion_internal(
        frames,
        max_visible_colors,
        pixel_size_override,
        Some(target_frame_size),
    )
}

fn snap_frames_with_spritefusion_internal(
    frames: &[RgbaImage],
    max_visible_colors: usize,
    pixel_size_override: Option<f64>,
    target_frame_size: Option<(u32, u32)>,
) -> Result<Vec<RgbaImage>, PrepError> {
    if frames.is_empty() {
        return Err(PrepError("at least one frame is required".to_string()));
    }
    if !(1..=15).contains(&max_visible_colors) {
        return Err(PrepError(
            "Sprite Fusion color limit must be between 1 and 15 visible colors".to_string(),
        ));
    }
    if pixel_size_override.is_some_and(|value| !value.is_finite() || value < 1.0) {
        return Err(PrepError(
            "pixel size override must be a finite value greater than or equal to 1".to_string(),
        ));
    }
    let frame_dimensions = frames[0].dimensions();
    if frames
        .iter()
        .any(|frame| frame.dimensions() != frame_dimensions)
    {
        return Err(PrepError(
            "all animation frames must share one source canvas before snapping".to_string(),
        ));
    }

    let temporary_root = spritefusion_temporary_root();
    let input_dir = temporary_root.join("input");
    let output_dir = temporary_root.join("output");
    std::fs::create_dir_all(&input_dir).map_err(|error| {
        PrepError(format!(
            "failed to create Sprite Fusion temporary directory: {error}"
        ))
    })?;

    let result = (|| {
        let shared_pixel_size = match pixel_size_override {
            Some(pixel_size) => pixel_size,
            None => target_frame_size
                .and_then(|target| pixel_size_for_target(frames[0].dimensions(), target))
                .map(Ok)
                .unwrap_or_else(|| {
                    detect_shared_pixel_size_with_spritefusion(
                        frames,
                        max_visible_colors,
                        &temporary_root,
                    )
                })?,
        };
        for (index, frame) in frames.iter().enumerate() {
            frame
                .save(input_dir.join(format!("frame-{index:04}.png")))
                .map_err(|error| PrepError(format!("failed to stage frame {index}: {error}")))?;
        }

        let config = BatchConfig {
            input_dir: input_dir.clone(),
            output_dir: output_dir.clone(),
            k_colors: max_visible_colors,
            pixel_size_override: Some(shared_pixel_size),
        };
        process_batch_with_reporter(&config, |_| {})
            .map_err(|error| PrepError(format!("Sprite Fusion Pixel Snapper failed: {error}")))?;

        frames
            .iter()
            .enumerate()
            .map(|(index, source_frame)| {
                let snapped = image::open(output_dir.join(format!("frame-{index:04}.png")))
                    .map(|image| image.to_rgba8())
                    .map_err(|error| {
                        PrepError(format!(
                            "failed to read snapped frame {index} from Sprite Fusion: {error}"
                        ))
                    })?;
                normalize_snapped_frame(&snapped, source_frame, shared_pixel_size)
            })
            .collect()
    })();

    let _ = std::fs::remove_dir_all(&temporary_root);
    result
}

fn pixel_size_for_target(source: (u32, u32), target: (u32, u32)) -> Option<f64> {
    let horizontal = source.0 as f64 / target.0 as f64;
    let vertical = source.1 as f64 / target.1 as f64;
    if horizontal < 1.0 || vertical < 1.0 {
        return None;
    }
    let relative_difference = (horizontal - vertical).abs() / horizontal.max(vertical);
    (relative_difference <= 0.1).then_some((horizontal + vertical) / 2.0)
}

fn normalize_snapped_frame(
    snapped: &RgbaImage,
    source: &RgbaImage,
    shared_pixel_size: f64,
) -> Result<RgbaImage, PrepError> {
    let target_width = (source.width() as f64 / shared_pixel_size).round() as u32;
    let target_height = (source.height() as f64 / shared_pixel_size).round() as u32;
    if target_width == 0 || target_height == 0 {
        return Err(PrepError(
            "shared pixel grid collapsed a snapped frame".to_string(),
        ));
    }
    let mut normalized = imageops::resize(
        snapped,
        target_width,
        target_height,
        imageops::FilterType::Nearest,
    );
    for y in 0..target_height {
        let source_y_start = y * source.height() / target_height;
        let source_y_end = ((y + 1) * source.height()).div_ceil(target_height);
        for x in 0..target_width {
            let source_x_start = x * source.width() / target_width;
            let source_x_end = ((x + 1) * source.width()).div_ceil(target_width);
            let (alpha_sum, alpha_count, red_sum, green_sum, blue_sum) = (source_y_start
                ..source_y_end)
                .flat_map(|source_y| {
                    (source_x_start..source_x_end)
                        .map(move |source_x| *source.get_pixel(source_x, source_y))
                })
                .fold(
                    (0_u64, 0_u64, 0_u64, 0_u64, 0_u64),
                    |(alpha_sum, count, red_sum, green_sum, blue_sum), pixel| {
                        let alpha = u64::from(pixel[3]);
                        (
                            alpha_sum + alpha,
                            count + 1,
                            red_sum + u64::from(pixel[0]) * alpha,
                            green_sum + u64::from(pixel[1]) * alpha,
                            blue_sum + u64::from(pixel[2]) * alpha,
                        )
                    },
                );
            let average_alpha = alpha_sum / alpha_count.max(1);
            if average_alpha < 128 {
                *normalized.get_pixel_mut(x, y) = Rgba([0, 0, 0, 0]);
            } else {
                let pixel = normalized.get_pixel_mut(x, y);
                if pixel.0[..3] == [0, 0, 0] && alpha_sum > 0 {
                    let source_color = [
                        (red_sum / alpha_sum) as u8,
                        (green_sum / alpha_sum) as u8,
                        (blue_sum / alpha_sum) as u8,
                    ];
                    if source_color != [0, 0, 0] {
                        pixel.0[..3].copy_from_slice(&source_color);
                    }
                }
                pixel[3] = 255;
            }
        }
    }
    Ok(normalized)
}

fn detect_shared_pixel_size_with_spritefusion(
    frames: &[RgbaImage],
    max_visible_colors: usize,
    temporary_root: &Path,
) -> Result<f64, PrepError> {
    let frame_width = frames[0].width();
    let frame_height = frames[0].height();
    let combined_width = frame_width
        .checked_mul(frames.len() as u32)
        .ok_or_else(|| PrepError("calibration sheet is too wide".to_string()))?;
    let mut combined = RgbaImage::new(combined_width, frame_height);
    for (index, frame) in frames.iter().enumerate() {
        imageops::overlay(&mut combined, frame, (index as u32 * frame_width).into(), 0);
    }

    let calibration_input = temporary_root.join("calibration-input");
    let calibration_output = temporary_root.join("calibration-output");
    std::fs::create_dir_all(&calibration_input).map_err(|error| {
        PrepError(format!(
            "failed to create Sprite Fusion calibration directory: {error}"
        ))
    })?;
    let calibration_name = "animation-strip.png";
    combined
        .save(calibration_input.join(calibration_name))
        .map_err(|error| PrepError(format!("failed to stage calibration sheet: {error}")))?;
    process_batch_with_reporter(
        &BatchConfig {
            input_dir: calibration_input,
            output_dir: calibration_output.clone(),
            k_colors: max_visible_colors,
            pixel_size_override: None,
        },
        |_| {},
    )
    .map_err(|error| PrepError(format!("Sprite Fusion calibration pass failed: {error}")))?;
    let calibrated = image::open(calibration_output.join(calibration_name)).map_err(|error| {
        PrepError(format!(
            "failed to read calibrated animation strip: {error}"
        ))
    })?;
    if calibrated.height() == 0 {
        return Err(PrepError(
            "Sprite Fusion calibration produced zero height".to_string(),
        ));
    }
    let detected = frame_height as f64 / calibrated.height() as f64;
    let rounded = detected.round();
    let shared_pixel_size = if (detected - rounded).abs() <= 0.2 {
        rounded
    } else {
        detected
    };
    let maximum = frame_width.min(frame_height) as f64 / 2.0;
    if !shared_pixel_size.is_finite() || shared_pixel_size < 1.0 || shared_pixel_size > maximum {
        return Err(PrepError(format!(
            "Sprite Fusion detected invalid shared pixel size {shared_pixel_size:.2}"
        )));
    }
    Ok(shared_pixel_size)
}

fn spritefusion_temporary_root() -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "gba-sprite-prep-{}-{timestamp}",
        std::process::id()
    ))
}

fn identifier(value: &str) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let collapsed = normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "animation".to_string()
    } else {
        collapsed
    }
}

#[derive(Debug, Clone, Copy)]
struct PixelBounds {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn validate_free_canvas(width: u32, height: u32) -> Result<(), PrepError> {
    if !(8..=128).contains(&width) || !(8..=128).contains(&height) {
        return Err(PrepError(
            "free canvas dimensions must be between 8 and 128 pixels".to_string(),
        ));
    }
    if !width.is_multiple_of(8) || !height.is_multiple_of(8) {
        return Err(PrepError(
            "free canvas dimensions must be multiples of 8".to_string(),
        ));
    }
    Ok(())
}

fn opaque_bounds(image: &RgbaImage) -> Option<PixelBounds> {
    let mut min_x = image.width();
    let mut min_y = image.height();
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;

    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] == 0 {
            continue;
        }
        found = true;
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }

    if found {
        Some(PixelBounds {
            x: min_x,
            y: min_y,
            width: max_x - min_x + 1,
            height: max_y - min_y + 1,
        })
    } else {
        None
    }
}

fn shared_scale(
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> f64 {
    let fit = (target_width as f64 / source_width as f64)
        .min(target_height as f64 / source_height as f64);
    if fit >= 1.0 {
        fit.floor().max(1.0)
    } else {
        fit
    }
}

fn scaled_dimension(source: u32, scale: f64, limit: u32) -> u32 {
    ((source as f64 * scale).round() as u32).clamp(1, limit)
}

fn anchor_position(
    anchor: Anchor,
    target_width: u32,
    target_height: u32,
    content_width: u32,
    content_height: u32,
) -> (u32, u32) {
    let x = target_width.saturating_sub(content_width) / 2;
    let y = match anchor {
        Anchor::BottomCenter => target_height.saturating_sub(content_height),
        Anchor::Center => target_height.saturating_sub(content_height) / 2,
    };
    (x, y)
}

fn gba_channel(channel: u8) -> u8 {
    (channel >> 3) << 3
}

fn gba_color(pixel: Rgba<u8>) -> [u8; 3] {
    [
        gba_channel(pixel[0]),
        gba_channel(pixel[1]),
        gba_channel(pixel[2]),
    ]
}

fn quantize_gba_palette(image: &mut RgbaImage, color_limit: usize) -> usize {
    let mut counts: BTreeMap<[u8; 3], usize> = BTreeMap::new();
    for pixel in image.pixels_mut() {
        if pixel[3] < 128 {
            *pixel = Rgba([0, 0, 0, 0]);
            continue;
        }
        let color = gba_color(*pixel);
        *pixel = Rgba([color[0], color[1], color[2], 255]);
        *counts.entry(color).or_default() += 1;
    }

    if counts.len() <= color_limit {
        return counts.len();
    }

    let palette = median_cut_palette(counts.clone(), color_limit);
    for pixel in image.pixels_mut().filter(|pixel| pixel[3] != 0) {
        let source = [pixel[0], pixel[1], pixel[2]];
        let nearest = palette
            .iter()
            .min_by_key(|candidate| color_distance(source, **candidate))
            .copied()
            .unwrap_or(source);
        *pixel = Rgba([nearest[0], nearest[1], nearest[2], 255]);
    }
    palette.len()
}

fn median_cut_palette(counts: BTreeMap<[u8; 3], usize>, limit: usize) -> Vec<[u8; 3]> {
    let mut boxes = vec![counts.into_iter().collect::<Vec<_>>()];
    while boxes.len() < limit {
        let Some((box_index, axis)) = boxes
            .iter()
            .enumerate()
            .filter(|(_, colors)| colors.len() > 1)
            .map(|(index, colors)| {
                let ranges = (0..3)
                    .map(|axis| {
                        let min = colors
                            .iter()
                            .map(|(color, _)| color[axis])
                            .min()
                            .unwrap_or(0);
                        let max = colors
                            .iter()
                            .map(|(color, _)| color[axis])
                            .max()
                            .unwrap_or(0);
                        max - min
                    })
                    .collect::<Vec<_>>();
                let axis = (0..3)
                    .max_by_key(|axis| (ranges[*axis], 2 - *axis))
                    .unwrap_or(0);
                let weight: usize = colors.iter().map(|(_, count)| count).sum();
                (index, axis, ranges[axis], weight, colors.len())
            })
            .max_by_key(|(_, _, range, weight, len)| (*range, *weight, *len))
            .map(|(index, axis, _, _, _)| (index, axis))
        else {
            break;
        };

        let mut colors = boxes.remove(box_index);
        colors.sort_by_key(|(color, _)| (color[axis], *color));
        let total: usize = colors.iter().map(|(_, count)| count).sum();
        let mut accumulated = 0;
        let mut split = 1;
        for (index, (_, count)) in colors.iter().enumerate().take(colors.len() - 1) {
            accumulated += count;
            if accumulated * 2 >= total {
                split = index + 1;
                break;
            }
        }
        let right = colors.split_off(split);
        boxes.push(colors);
        boxes.push(right);
    }

    boxes
        .into_iter()
        .map(|colors| {
            let total: usize = colors.iter().map(|(_, count)| count).sum();
            let mut channels = [0usize; 3];
            for (color, count) in colors {
                for axis in 0..3 {
                    channels[axis] += color[axis] as usize * count;
                }
            }
            [
                gba_channel((channels[0] / total) as u8),
                gba_channel((channels[1] / total) as u8),
                gba_channel((channels[2] / total) as u8),
            ]
        })
        .collect()
}

fn color_distance(left: [u8; 3], right: [u8; 3]) -> u32 {
    left.iter()
        .zip(right)
        .map(|(a, b)| (*a as i32 - b as i32).pow(2) as u32)
        .sum()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct HardwareObjectPart {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HardwareLayoutChoice {
    Native,
    Vertical(usize),
    Horizontal(usize),
}

fn hardware_object_layout(width: u32, height: u32) -> Vec<HardwareObjectPart> {
    const HARDWARE_SHAPES: &[(usize, usize)] = &[
        (1, 1),
        (2, 2),
        (4, 4),
        (8, 8),
        (2, 1),
        (4, 1),
        (4, 2),
        (8, 4),
        (1, 2),
        (1, 4),
        (2, 4),
        (4, 8),
    ];
    let tiles_wide = (width / 8) as usize;
    let tiles_high = (height / 8) as usize;
    let mut costs = vec![vec![u32::MAX; tiles_high + 1]; tiles_wide + 1];
    let mut choices = vec![vec![None; tiles_high + 1]; tiles_wide + 1];
    for row in costs.iter_mut().take(tiles_wide + 1) {
        row[0] = 0;
    }
    for cell in costs[0].iter_mut().take(tiles_high + 1) {
        *cell = 0;
    }

    for current_width in 1..=tiles_wide {
        for current_height in 1..=tiles_high {
            if HARDWARE_SHAPES.contains(&(current_width, current_height)) {
                costs[current_width][current_height] = 1;
                choices[current_width][current_height] = Some(HardwareLayoutChoice::Native);
                continue;
            }
            for split in (1..current_width).rev() {
                let candidate =
                    costs[split][current_height] + costs[current_width - split][current_height];
                if candidate < costs[current_width][current_height] {
                    costs[current_width][current_height] = candidate;
                    choices[current_width][current_height] =
                        Some(HardwareLayoutChoice::Vertical(split));
                }
            }
            for split in (1..current_height).rev() {
                let candidate =
                    costs[current_width][split] + costs[current_width][current_height - split];
                if candidate < costs[current_width][current_height] {
                    costs[current_width][current_height] = candidate;
                    choices[current_width][current_height] =
                        Some(HardwareLayoutChoice::Horizontal(split));
                }
            }
        }
    }

    fn append_parts(
        choices: &[Vec<Option<HardwareLayoutChoice>>],
        width: usize,
        height: usize,
        x: usize,
        y: usize,
        parts: &mut Vec<HardwareObjectPart>,
    ) {
        match choices[width][height].expect("hardware layout must be solvable with 8x8 OBJs") {
            HardwareLayoutChoice::Native => parts.push(HardwareObjectPart {
                x: (x * 8) as u32,
                y: (y * 8) as u32,
                width: (width * 8) as u32,
                height: (height * 8) as u32,
            }),
            HardwareLayoutChoice::Vertical(split) => {
                append_parts(choices, split, height, x, y, parts);
                append_parts(choices, width - split, height, x + split, y, parts);
            }
            HardwareLayoutChoice::Horizontal(split) => {
                append_parts(choices, width, split, x, y, parts);
                append_parts(choices, width, height - split, x, y + split, parts);
            }
        }
    }

    let mut parts = Vec::with_capacity(costs[tiles_wide][tiles_high] as usize);
    append_parts(&choices, tiles_wide, tiles_high, 0, 0, &mut parts);
    parts
}

fn minimum_hardware_objects(width: u32, height: u32) -> u32 {
    hardware_object_layout(width, height).len() as u32
}

fn profile_warnings(profile: &SpriteProfile, hardware_objects_per_frame: u32) -> Vec<String> {
    let mut warnings = Vec::new();
    if profile.frame_width > 64 || profile.frame_height > 64 {
        warnings.push(format!(
            "Canvas de metasprite decomposto automaticamente em {hardware_objects_per_frame} OBJs nativos do GBA."
        ));
    }
    if profile.frame_width * profile.frame_height > 8_192 {
        warnings.push(
            "Canvas acima de 8.192 pixels deve ser reservado para chefes ou arte de cena."
                .to_string(),
        );
    }
    if hardware_objects_per_frame > 4 {
        warnings.push(format!(
            "Cada frame requer pelo menos {hardware_objects_per_frame} OBJs de hardware."
        ));
    }
    warnings
}
