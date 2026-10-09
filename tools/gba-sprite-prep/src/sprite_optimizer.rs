use image::{imageops, RgbaImage};
use serde::Serialize;
use std::collections::BTreeSet;

const OBJ_TILE_BYTES_4BPP: u32 = 32;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SpriteOptimizationOptions {
    /// Horizontal mirroring is opt-in because many actors carry asymmetric props.
    pub allow_mirrored_frames: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteFrameReuse {
    pub frame: usize,
    pub reuses: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteResourceOptimization {
    pub strategy: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub frame_count: usize,
    pub tiles_per_frame: u32,
    pub unique_tiles_before: u32,
    pub unique_tiles_after: u32,
    pub reused_tile_count: u32,
    pub original_tile_bytes: u32,
    pub optimized_tile_bytes: u32,
    pub saved_tile_bytes: u32,
    pub exact_duplicate_frames: Vec<SpriteFrameReuse>,
    pub mirrored_frame_reuses: Vec<SpriteFrameReuse>,
    pub visual_error_pixels: u32,
    pub anchor_adjustments: u32,
    pub palette_changes: u32,
}

fn normalized_pixel(frame: &RgbaImage, x: u32, y: u32) -> [u8; 4] {
    if x >= frame.width() || y >= frame.height() {
        return [0, 0, 0, 0];
    }
    let pixel = frame.get_pixel(x, y).0;
    if pixel[3] == 0 {
        [0, 0, 0, 0]
    } else {
        pixel
    }
}

fn tile_key(frame: &RgbaImage, tile_x: u32, tile_y: u32) -> Vec<u8> {
    let mut key = Vec::with_capacity(8 * 8 * 4);
    for y in tile_y * 8..tile_y * 8 + 8 {
        for x in tile_x * 8..tile_x * 8 + 8 {
            key.extend_from_slice(&normalized_pixel(frame, x, y));
        }
    }
    key
}

fn frame_reuses(
    frames: &[RgbaImage],
    allow_mirrored_frames: bool,
) -> (Vec<SpriteFrameReuse>, Vec<SpriteFrameReuse>) {
    let mut exact = Vec::new();
    let mut mirrored = Vec::new();
    for (frame_index, frame) in frames.iter().enumerate() {
        if let Some(reuses) =
            (0..frame_index).find(|candidate| frames[*candidate].as_raw() == frame.as_raw())
        {
            exact.push(SpriteFrameReuse {
                frame: frame_index,
                reuses,
            });
            continue;
        }
        if allow_mirrored_frames {
            let flipped = imageops::flip_horizontal(frame);
            if let Some(reuses) =
                (0..frame_index).find(|candidate| frames[*candidate].as_raw() == flipped.as_raw())
            {
                mirrored.push(SpriteFrameReuse {
                    frame: frame_index,
                    reuses,
                });
            }
        }
    }
    (exact, mirrored)
}

pub fn optimize_sprite_resources(
    frames: &[RgbaImage],
    options: &SpriteOptimizationOptions,
) -> Result<SpriteResourceOptimization, String> {
    let first = frames
        .first()
        .ok_or_else(|| "sprite optimizer requires at least one frame".to_string())?;
    if first.width() == 0 || first.height() == 0 {
        return Err("sprite frames must have positive dimensions".to_string());
    }
    if frames
        .iter()
        .any(|frame| frame.dimensions() != first.dimensions())
    {
        return Err(
            "sprite frames must have the same dimensions; resizing is not allowed".to_string(),
        );
    }
    if frames
        .iter()
        .flat_map(|frame| frame.pixels())
        .any(|pixel| pixel[3] != 0 && pixel[3] != 255)
    {
        return Err(
            "sprite frames must use binary alpha; partial alpha is not allowed".to_string(),
        );
    }

    let tiles_wide = first.width().div_ceil(8);
    let tiles_high = first.height().div_ceil(8);
    let tiles_per_frame = tiles_wide * tiles_high;
    let unique_tiles = frames
        .iter()
        .flat_map(|frame| {
            (0..tiles_high).flat_map(move |tile_y| {
                (0..tiles_wide).map(move |tile_x| tile_key(frame, tile_x, tile_y))
            })
        })
        .collect::<BTreeSet<_>>();
    let unique_tiles_before = tiles_per_frame.saturating_mul(frames.len() as u32);
    let unique_tiles_after = unique_tiles.len() as u32;
    let reused_tile_count = unique_tiles_before.saturating_sub(unique_tiles_after);
    let original_tile_bytes = unique_tiles_before.saturating_mul(OBJ_TILE_BYTES_4BPP);
    let optimized_tile_bytes = unique_tiles_after.saturating_mul(OBJ_TILE_BYTES_4BPP);
    let exact_duplicate_frames;
    let mirrored_frame_reuses;
    (exact_duplicate_frames, mirrored_frame_reuses) =
        frame_reuses(frames, options.allow_mirrored_frames);

    Ok(SpriteResourceOptimization {
        strategy: "exact-structural-reuse-v1".to_string(),
        frame_width: first.width(),
        frame_height: first.height(),
        frame_count: frames.len(),
        tiles_per_frame,
        unique_tiles_before,
        unique_tiles_after,
        reused_tile_count,
        original_tile_bytes,
        optimized_tile_bytes,
        saved_tile_bytes: original_tile_bytes.saturating_sub(optimized_tile_bytes),
        exact_duplicate_frames,
        mirrored_frame_reuses,
        visual_error_pixels: 0,
        anchor_adjustments: 0,
        palette_changes: 0,
    })
}
