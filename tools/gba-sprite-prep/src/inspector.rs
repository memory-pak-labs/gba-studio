use crate::{
    optimize_sprite_resources, Anchor, AnimationMetadata, DetectedFrame, PrepError,
    PreparedSpritePack, SpriteOptimizationOptions, SpritePackManifest, SpriteResourceOptimization,
};
use image::codecs::gif::{GifEncoder, Repeat};
use image::{imageops, Delay, Frame, Rgba, RgbaImage};
use serde::Serialize;
use std::collections::BTreeSet;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InspectorOptions {
    pub scale: u32,
    pub scene_actor_count: u32,
    pub collision_width: u32,
    pub collision_height: u32,
}

impl Default for InspectorOptions {
    fn default() -> Self {
        Self {
            scale: 8,
            scene_actor_count: 1,
            collision_width: 16,
            collision_height: 16,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BudgetStatus {
    Safe,
    Attention,
    Impossible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetMetric {
    pub value: u32,
    pub attention_at: u32,
    pub limit: u32,
    pub status: BudgetStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInspection {
    pub objects_per_frame: u32,
    pub scene_objects: BudgetMetric,
    pub scanline_objects: BudgetMetric,
    pub vram_bytes: BudgetMetric,
    pub visible_colors: BudgetMetric,
    pub overall: BudgetStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationInspection {
    pub name: String,
    pub state: String,
    pub direction: String,
    pub fps: u32,
    pub loops: bool,
    pub frame_count: usize,
    pub vram_bytes: u32,
    pub objects_per_frame: u32,
    pub max_displacement_pixels: u32,
    pub changed_pixels: u32,
    pub palette_changes: u32,
    pub duplicate_frames: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationVisualDiagnostics {
    pub name: String,
    pub scale_drift_percent: f32,
    pub baseline_drift_pixels: u32,
    pub palette_set_variation_frames: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualDiagnostics {
    pub halo_pixels: u32,
    pub cut_frames: Vec<usize>,
    pub scale_drift_percent: f32,
    pub palette_set_variation_frames: Vec<usize>,
    pub animation_diagnostics: Vec<AnimationVisualDiagnostics>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameReuse {
    pub frame: usize,
    pub reuses: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationInspection {
    pub exact_duplicate_frames: Vec<FrameReuse>,
    pub mirrored_frames: Vec<FrameReuse>,
    pub original_vram_bytes: u32,
    pub optimized_vram_bytes: u32,
    pub saved_vram_bytes: u32,
    pub resource: SpriteResourceOptimization,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationInspectorReport {
    pub schema_version: u32,
    pub animations: Vec<AnimationInspection>,
    pub hardware: HardwareInspection,
    pub diagnostics: VisualDiagnostics,
    pub optimization: OptimizationInspection,
    pub generated_files: Vec<String>,
}

fn metric(value: u32, attention_at: u32, limit: u32) -> BudgetMetric {
    let status = if value > limit {
        BudgetStatus::Impossible
    } else if value >= attention_at {
        BudgetStatus::Attention
    } else {
        BudgetStatus::Safe
    };
    BudgetMetric {
        value,
        attention_at,
        limit,
        status,
    }
}

fn worst_status(statuses: impl IntoIterator<Item = BudgetStatus>) -> BudgetStatus {
    statuses
        .into_iter()
        .max_by_key(|status| match status {
            BudgetStatus::Safe => 0,
            BudgetStatus::Attention => 1,
            BudgetStatus::Impossible => 2,
        })
        .unwrap_or(BudgetStatus::Safe)
}

fn crop_prepared_frames(prepared: &PreparedSpritePack) -> Vec<RgbaImage> {
    let width = prepared.report.profile.frame_width;
    let height = prepared.report.profile.frame_height;
    (0..prepared.report.frame_count)
        .map(|index| {
            imageops::crop_imm(&prepared.sheet, index as u32 * width, 0, width, height).to_image()
        })
        .collect()
}

fn crop_source_frame(source: &RgbaImage, frame: &DetectedFrame) -> RgbaImage {
    imageops::crop_imm(
        source,
        frame.source_x,
        frame.source_y,
        frame.source_width,
        frame.source_height,
    )
    .to_image()
}

fn selected_source_frames(
    source: &RgbaImage,
    manifest: &SpritePackManifest,
    prepared: &PreparedSpritePack,
) -> Result<Vec<RgbaImage>, PrepError> {
    manifest
        .animations
        .iter()
        .flat_map(|animation| animation.frames.iter())
        .map(|index| {
            prepared
                .detection
                .frames
                .get(*index)
                .map(|frame| crop_source_frame(source, frame))
                .ok_or_else(|| PrepError(format!("inspector cannot find source frame {index}")))
        })
        .collect()
}

fn scale_frame(frame: &RgbaImage, scale: u32) -> RgbaImage {
    imageops::resize(
        frame,
        frame.width() * scale,
        frame.height() * scale,
        imageops::FilterType::Nearest,
    )
}

fn blend_pixel(target: &mut RgbaImage, x: u32, y: u32, source: Rgba<u8>) {
    if x >= target.width() || y >= target.height() || source[3] == 0 {
        return;
    }
    let destination = *target.get_pixel(x, y);
    let alpha = source[3] as u32;
    let inverse = 255 - alpha;
    let mut output = [0u8; 4];
    for channel in 0..3 {
        output[channel] =
            ((source[channel] as u32 * alpha + destination[channel] as u32 * inverse) / 255) as u8;
    }
    output[3] = 255;
    target.put_pixel(x, y, Rgba(output));
}

fn blit(target: &mut RgbaImage, source: &RgbaImage, offset_x: u32, offset_y: u32) {
    for (x, y, pixel) in source.enumerate_pixels() {
        blend_pixel(target, offset_x + x, offset_y + y, *pixel);
    }
}

fn draw_rect(image: &mut RgbaImage, x: i32, y: i32, width: u32, height: u32, color: Rgba<u8>) {
    if width == 0 || height == 0 {
        return;
    }
    let right = x + width as i32 - 1;
    let bottom = y + height as i32 - 1;
    for current_x in x..=right {
        put_checked(image, current_x, y, color);
        put_checked(image, current_x, bottom, color);
    }
    for current_y in y..=bottom {
        put_checked(image, x, current_y, color);
        put_checked(image, right, current_y, color);
    }
}

fn put_checked(image: &mut RgbaImage, x: i32, y: i32, color: Rgba<u8>) {
    if x >= 0 && y >= 0 && (x as u32) < image.width() && (y as u32) < image.height() {
        image.put_pixel(x as u32, y as u32, color);
    }
}

const DIGITS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b010, 0b010, 0b010],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];

fn draw_number(image: &mut RgbaImage, value: usize, x: u32, y: u32, scale: u32) {
    let digits = value.to_string();
    for (digit_index, digit) in digits.bytes().enumerate() {
        let glyph = DIGITS[(digit - b'0') as usize];
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..3 {
                if bits & (1 << (2 - column)) == 0 {
                    continue;
                }
                for pixel_y in 0..scale {
                    for pixel_x in 0..scale {
                        let target_x =
                            x + digit_index as u32 * 4 * scale + column as u32 * scale + pixel_x;
                        let target_y = y + row as u32 * scale + pixel_y;
                        if target_x < image.width() && target_y < image.height() {
                            image.put_pixel(target_x, target_y, Rgba([255, 255, 255, 255]));
                        }
                    }
                }
            }
        }
    }
}

fn animation_ranges(manifest: &SpritePackManifest) -> Vec<std::ops::Range<usize>> {
    let mut cursor = 0usize;
    manifest
        .animations
        .iter()
        .map(|animation| {
            let start = cursor;
            cursor += animation.frames.len();
            start..cursor
        })
        .collect()
}

fn render_numbered(frames: &[RgbaImage], manifest: &SpritePackManifest, scale: u32) -> RgbaImage {
    let frame_width = frames.first().map_or(1, RgbaImage::width) * scale;
    let frame_height = frames.first().map_or(1, RgbaImage::height) * scale;
    let ranges = animation_ranges(manifest);
    let columns = ranges.iter().map(|range| range.len()).max().unwrap_or(1) as u32;
    let cell_width = frame_width + 4;
    let cell_height = frame_height + 14;
    let mut output = RgbaImage::from_pixel(
        columns * cell_width,
        ranges.len() as u32 * cell_height,
        Rgba([24, 28, 36, 255]),
    );
    for (row, range) in ranges.iter().enumerate() {
        for (column, frame_index) in range.clone().enumerate() {
            let x = column as u32 * cell_width + 2;
            let y = row as u32 * cell_height + 2;
            blit(&mut output, &scale_frame(&frames[frame_index], scale), x, y);
            draw_number(&mut output, frame_index + 1, x + 2, y + frame_height + 3, 1);
        }
    }
    output
}

fn render_hardware(
    frames: &[RgbaImage],
    animations: &[AnimationMetadata],
    manifest: &SpritePackManifest,
    options: &InspectorOptions,
) -> RgbaImage {
    let mut output = render_numbered(frames, manifest, options.scale);
    let frame_width = frames[0].width() * options.scale;
    let frame_height = frames[0].height() * options.scale;
    let cell_width = frame_width + 4;
    let cell_height = frame_height + 14;
    for (row, animation) in animations.iter().enumerate() {
        for (column, frame) in animation.frames.iter().enumerate() {
            let origin_x = column as u32 * cell_width + 2;
            let origin_y = row as u32 * cell_height + 2;
            for (part_index, tile) in frame.tiles.iter().enumerate() {
                let color = if part_index % 2 == 0 {
                    Rgba([255, 80, 96, 255])
                } else {
                    Rgba([72, 196, 255, 255])
                };
                draw_rect(
                    &mut output,
                    origin_x as i32 + tile.x * options.scale as i32,
                    origin_y as i32 + tile.y * options.scale as i32,
                    tile.tile_width * options.scale,
                    tile.tile_height * options.scale,
                    color,
                );
            }
            let pivot_x = origin_x + frame.origin_x * options.scale;
            let pivot_y = origin_y + frame.origin_y.min(frames[0].height() - 1) * options.scale;
            for delta in -3..=3 {
                put_checked(
                    &mut output,
                    pivot_x as i32 + delta,
                    pivot_y as i32,
                    Rgba([255, 232, 64, 255]),
                );
                put_checked(
                    &mut output,
                    pivot_x as i32,
                    pivot_y as i32 + delta,
                    Rgba([255, 232, 64, 255]),
                );
            }
            let collision_width = options.collision_width.min(frames[0].width()) * options.scale;
            let collision_height = options.collision_height.min(frames[0].height()) * options.scale;
            draw_rect(
                &mut output,
                origin_x as i32 + (frame_width.saturating_sub(collision_width) / 2) as i32,
                origin_y as i32 + frame_height.saturating_sub(collision_height) as i32,
                collision_width,
                collision_height,
                Rgba([96, 255, 128, 255]),
            );
        }
    }
    output
}

fn tint(frame: &RgbaImage, color: [u8; 3], alpha: u8) -> RgbaImage {
    let mut output = frame.clone();
    for pixel in output.pixels_mut() {
        if pixel[3] != 0 {
            *pixel = Rgba([color[0], color[1], color[2], alpha]);
        }
    }
    output
}

fn render_onion_skin(frames: &[RgbaImage], manifest: &SpritePackManifest, scale: u32) -> RgbaImage {
    let mut output = render_numbered(frames, manifest, scale);
    let frame_width = frames[0].width() * scale;
    let frame_height = frames[0].height() * scale;
    let cell_width = frame_width + 4;
    let cell_height = frame_height + 14;
    for (row, range) in animation_ranges(manifest).iter().enumerate() {
        for (column, frame_index) in range.clone().enumerate() {
            let x = column as u32 * cell_width + 2;
            let y = row as u32 * cell_height + 2;
            for pixel_y in y..(y + frame_height) {
                for pixel_x in x..(x + frame_width) {
                    output.put_pixel(pixel_x, pixel_y, Rgba([24, 28, 36, 255]));
                }
            }
            if frame_index > range.start {
                blit(
                    &mut output,
                    &scale_frame(&tint(&frames[frame_index - 1], [255, 72, 96], 96), scale),
                    x,
                    y,
                );
            }
            blit(
                &mut output,
                &scale_frame(&tint(&frames[frame_index], [96, 255, 160], 210), scale),
                x,
                y,
            );
        }
    }
    output
}

fn render_strip(frames: &[RgbaImage], width: u32, height: u32, scale: u32) -> RgbaImage {
    let mut output = RgbaImage::from_pixel(
        width * scale * frames.len() as u32,
        height * scale,
        Rgba([24, 28, 36, 255]),
    );
    for (index, frame) in frames.iter().enumerate() {
        let normalized = imageops::resize(frame, width, height, imageops::FilterType::Nearest);
        blit(
            &mut output,
            &scale_frame(&normalized, scale),
            index as u32 * width * scale,
            0,
        );
    }
    output
}

fn write_gif(
    path: &Path,
    frames: &[RgbaImage],
    fps: u32,
    loops: bool,
    scale: u32,
) -> Result<(), PrepError> {
    let file = File::create(path).map_err(|error| {
        PrepError(format!(
            "failed to create GIF '{}': {error}",
            path.display()
        ))
    })?;
    let mut encoder = GifEncoder::new(BufWriter::new(file));
    if loops {
        encoder
            .set_repeat(Repeat::Infinite)
            .map_err(|error| PrepError(format!("failed to set GIF repeat: {error}")))?;
    }
    let delay = Delay::from_numer_denom_ms(1000, fps.max(1));
    let encoded = frames
        .iter()
        .map(|frame| Frame::from_parts(scale_frame(frame, scale), 0, 0, delay));
    encoder.encode_frames(encoded).map_err(|error| {
        PrepError(format!(
            "failed to encode GIF '{}': {error}",
            path.display()
        ))
    })
}

fn write_consolidated_gif(
    path: &Path,
    frames: &[(RgbaImage, u32)],
    scale: u32,
) -> Result<(), PrepError> {
    let file = File::create(path).map_err(|error| {
        PrepError(format!(
            "failed to create GIF '{}': {error}",
            path.display()
        ))
    })?;
    let mut encoder = GifEncoder::new(BufWriter::new(file));
    encoder
        .set_repeat(Repeat::Infinite)
        .map_err(|error| PrepError(format!("failed to set GIF repeat: {error}")))?;
    let encoded = frames.iter().map(|(frame, fps)| {
        Frame::from_parts(
            scale_frame(frame, scale),
            0,
            0,
            Delay::from_numer_denom_ms(1000, (*fps).max(1)),
        )
    });
    encoder.encode_frames(encoded).map_err(|error| {
        PrepError(format!(
            "failed to encode GIF '{}': {error}",
            path.display()
        ))
    })
}

fn opaque_centroid(frame: &RgbaImage) -> Option<(f32, f32)> {
    let mut x = 0u64;
    let mut y = 0u64;
    let mut count = 0u64;
    for (pixel_x, pixel_y, pixel) in frame.enumerate_pixels() {
        if pixel[3] >= 128 {
            x += pixel_x as u64;
            y += pixel_y as u64;
            count += 1;
        }
    }
    (count > 0).then_some((x as f32 / count as f32, y as f32 / count as f32))
}

fn frame_colors(frame: &RgbaImage) -> BTreeSet<[u8; 3]> {
    frame
        .pixels()
        .filter(|pixel| pixel[3] >= 128)
        .map(|pixel| [pixel[0], pixel[1], pixel[2]])
        .collect()
}

fn touches_edge(frame: &RgbaImage, anchor: Anchor) -> bool {
    if frame.width() == 0 || frame.height() == 0 {
        return false;
    }
    let touches_top = (0..frame.width()).any(|x| frame.get_pixel(x, 0)[3] >= 128);
    let touches_bottom = anchor != Anchor::BottomCenter
        && (0..frame.width()).any(|x| frame.get_pixel(x, frame.height() - 1)[3] >= 128);
    let touches_side = (0..frame.height()).any(|y| {
        frame.get_pixel(0, y)[3] >= 128 || frame.get_pixel(frame.width() - 1, y)[3] >= 128
    });
    touches_top || touches_bottom || touches_side
}

fn changed_pixels(source: &RgbaImage, prepared: &RgbaImage) -> u32 {
    let normalized = imageops::resize(
        source,
        prepared.width(),
        prepared.height(),
        imageops::FilterType::Nearest,
    );
    normalized
        .pixels()
        .zip(prepared.pixels())
        .filter(|(left, right)| left.0 != right.0)
        .count() as u32
}

fn source_content_bounds(frame: &RgbaImage) -> Option<(u32, u32, u32, u32)> {
    let mut min_x = frame.width();
    let mut min_y = frame.height();
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;
    for (x, y, pixel) in frame.enumerate_pixels() {
        if pixel[3] >= 128 {
            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }
    found.then_some((min_x, min_y, max_x, max_y))
}

fn anchor_coordinate(bounds: (u32, u32, u32, u32), anchor: Anchor) -> u32 {
    match anchor {
        Anchor::BottomCenter => bounds.3,
        Anchor::Center => (bounds.1 + bounds.3) / 2,
    }
}

fn animation_visual_diagnostics(
    name: &str,
    frame_start: usize,
    frames: &[RgbaImage],
    anchor: Anchor,
) -> AnimationVisualDiagnostics {
    let bounds = frames
        .iter()
        .filter_map(source_content_bounds)
        .collect::<Vec<_>>();
    let sizes = bounds
        .iter()
        .map(|(_, min_y, _, max_y)| (max_y - min_y + 1, *min_y, *max_y))
        .collect::<Vec<_>>();
    let max_height = sizes
        .iter()
        .map(|(height, _, _)| *height)
        .max()
        .unwrap_or(1);
    let min_height = sizes
        .iter()
        .map(|(height, _, _)| *height)
        .min()
        .unwrap_or(max_height);
    let scale_drift_percent = (max_height - min_height) as f32 / max_height as f32 * 100.0;
    let anchor_positions = bounds
        .iter()
        .map(|bound| anchor_coordinate(*bound, anchor))
        .collect::<Vec<_>>();
    let max_anchor = anchor_positions.iter().copied().max().unwrap_or(0);
    let min_anchor = anchor_positions.iter().copied().min().unwrap_or(max_anchor);
    let palettes = frames.iter().map(frame_colors).collect::<Vec<_>>();
    let palette_set_variation_frames = palettes
        .windows(2)
        .enumerate()
        .filter_map(|(local_index, pair)| {
            (pair[0] != pair[1]).then_some(frame_start + local_index + 1)
        })
        .collect();
    AnimationVisualDiagnostics {
        name: name.to_string(),
        scale_drift_percent,
        baseline_drift_pixels: max_anchor.saturating_sub(min_anchor),
        palette_set_variation_frames,
    }
}

fn safe_file_name(name: &str) -> String {
    let normalized = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if normalized.is_empty() {
        "animation".to_string()
    } else {
        normalized
    }
}

fn write_png(path: &Path, image: &RgbaImage) -> Result<(), PrepError> {
    image
        .save(path)
        .map_err(|error| PrepError(format!("failed to save '{}': {error}", path.display())))
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn inspector_html(report: &AnimationInspectorReport) -> String {
    let animation_rows = report
        .animations
        .iter()
        .map(|animation| {
            format!(
                "<tr><td>{}</td><td>{}/{}</td><td>{} FPS</td><td>{}</td><td>{} B</td><td>{} OBJ</td></tr>",
                escape_html(&animation.name),
                escape_html(&animation.state),
                escape_html(&animation.direction),
                animation.fps,
                if animation.loops { "loop" } else { "uma vez" },
                animation.vram_bytes,
                animation.objects_per_frame,
            )
        })
        .collect::<String>();
    let diagnostic_rows = report
        .diagnostics
        .animation_diagnostics
        .iter()
        .map(|diagnostic| {
            let palette_frames = if diagnostic.palette_set_variation_frames.is_empty() {
                "nenhuma".to_string()
            } else {
                diagnostic
                    .palette_set_variation_frames
                    .iter()
                    .map(|frame| frame.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            format!(
                "<tr><td>{}</td><td>{:.2}%</td><td>{} px</td><td>{}</td></tr>",
                escape_html(&diagnostic.name),
                diagnostic.scale_drift_percent,
                diagnostic.baseline_drift_pixels,
                palette_frames,
            )
        })
        .collect::<String>();
    format!(
        r#"<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><title>Inspector de Animação</title>
<style>body{{font:14px system-ui;background:#141821;color:#eef2ff;margin:24px}}main{{max-width:960px;margin:auto}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}}.card{{background:#202736;padding:12px;border-radius:8px}}.compare{{position:relative;width:100%;overflow:hidden;background:#222}}.compare img,.pixel{{display:block;max-width:100%;image-rendering:pixelated}}#after{{position:absolute;inset:0;width:100%;clip-path:inset(0 50% 0 0)}}input{{width:100%}}code,a{{color:#8de1ff}}table{{width:100%;border-collapse:collapse;margin:18px 0}}td,th{{padding:8px;border-bottom:1px solid #354057;text-align:left}}</style>
<main><h1>Inspector de Animação</h1><p>Status geral: <code>{:?}</code></p>
<section class="grid"><div class="card"><b>VRAM</b><br>{} / {} bytes<br><code>{:?}</code></div><div class="card"><b>OAM da cena</b><br>{} / {} OBJs<br><code>{:?}</code></div><div class="card"><b>Scanline</b><br>{} / {} OBJs<br><code>{:?}</code></div><div class="card"><b>Paleta</b><br>{} / {} cores<br><code>{:?}</code></div><div class="card"><b>Deduplicação</b><br>{} bytes de frames<br>{} bytes de tiles<br><code>erro visual: {} px</code></div></section>
<table><thead><tr><th>Animação</th><th>Estado/direção</th><th>Velocidade</th><th>Loop</th><th>VRAM</th><th>OAM</th></tr></thead><tbody>{}</tbody></table>
<h2>Diagnóstico por animação</h2><p>Diferenças de largura entre direções não são tratadas como deriva. A variação de paleta é informativa; o banco global continua limitado a 15 cores visíveis.</p>
<table><thead><tr><th>Animação</th><th>Deriva de altura</th><th>Deriva da âncora</th><th>Variação de conjunto de cores</th></tr></thead><tbody>{}</tbody></table>
<h2>Preview animado</h2><img class="pixel" src="preview.gif"><h2>Comparação antes/depois</h2>
<div class="compare"><img src="before.png"><img id="after" src="after.png"></div>
<input type="range" min="0" max="100" value="50" aria-label="Comparação antes e depois" oninput="document.getElementById('after').style.clipPath=`inset(0 ${{100-this.value}}% 0 0)`">
<h2>Overlays</h2><p><a href="numbered.png">Sheet numerada</a> · <a href="hardware.png">Hardware</a> · <a href="onion-skin.png">Onion skin</a> · <a href="comparison.png">Comparação vertical</a></p><img class="pixel" src="hardware.png"></main></html>"#,
        report.hardware.overall,
        report.hardware.vram_bytes.value,
        report.hardware.vram_bytes.limit,
        report.hardware.vram_bytes.status,
        report.hardware.scene_objects.value,
        report.hardware.scene_objects.limit,
        report.hardware.scene_objects.status,
        report.hardware.scanline_objects.value,
        report.hardware.scanline_objects.limit,
        report.hardware.scanline_objects.status,
        report.hardware.visible_colors.value,
        report.hardware.visible_colors.limit,
        report.hardware.visible_colors.status,
        report.optimization.saved_vram_bytes,
        report.optimization.resource.saved_tile_bytes,
        report.optimization.resource.visual_error_pixels,
        animation_rows,
        diagnostic_rows,
    )
}

pub fn write_animation_inspector(
    output_directory: &Path,
    source: &RgbaImage,
    manifest: &SpritePackManifest,
    prepared: &PreparedSpritePack,
    options: &InspectorOptions,
) -> Result<AnimationInspectorReport, PrepError> {
    if options.scale == 0 {
        return Err(PrepError(
            "inspector scale must be greater than zero".to_string(),
        ));
    }
    std::fs::create_dir_all(output_directory).map_err(|error| {
        PrepError(format!(
            "failed to create inspector directory '{}': {error}",
            output_directory.display()
        ))
    })?;
    let frames = crop_prepared_frames(prepared);
    let source_frames = selected_source_frames(source, manifest, prepared)?;
    if frames.len() != source_frames.len() {
        return Err(PrepError(
            "inspector source and prepared frame counts do not match".to_string(),
        ));
    }
    let resource_optimization = optimize_sprite_resources(
        &frames,
        &SpriteOptimizationOptions {
            allow_mirrored_frames: manifest.optimization.allow_mirrored_frames,
        },
    )
    .map_err(PrepError)?;
    let numbered = render_numbered(&frames, manifest, options.scale);
    let hardware = render_hardware(&frames, &prepared.animations, manifest, options);
    let onion = render_onion_skin(&frames, manifest, options.scale);
    let before = render_strip(
        &source_frames,
        prepared.report.profile.frame_width,
        prepared.report.profile.frame_height,
        options.scale,
    );
    let after = render_strip(
        &frames,
        prepared.report.profile.frame_width,
        prepared.report.profile.frame_height,
        options.scale,
    );
    let mut comparison = RgbaImage::from_pixel(
        before.width(),
        before.height() * 2 + 4,
        Rgba([255, 232, 64, 255]),
    );
    blit(&mut comparison, &before, 0, 0);
    blit(&mut comparison, &after, 0, before.height() + 4);
    write_png(&output_directory.join("numbered.png"), &numbered)?;
    write_png(&output_directory.join("hardware.png"), &hardware)?;
    write_png(&output_directory.join("onion-skin.png"), &onion)?;
    write_png(&output_directory.join("before.png"), &before)?;
    write_png(&output_directory.join("after.png"), &after)?;
    write_png(&output_directory.join("comparison.png"), &comparison)?;

    let ranges = animation_ranges(manifest);
    let mut all_gif_frames = Vec::new();
    let mut animation_reports = Vec::new();
    for ((spec, metadata), range) in manifest
        .animations
        .iter()
        .zip(prepared.animations.iter())
        .zip(ranges.iter())
    {
        let animation_frames = &frames[range.clone()];
        let animation_sources = &source_frames[range.clone()];
        write_gif(
            &output_directory.join(format!("{}.gif", safe_file_name(&spec.name))),
            animation_frames,
            spec.fps,
            spec.loops,
            options.scale,
        )?;
        all_gif_frames.extend(
            animation_frames
                .iter()
                .cloned()
                .map(|frame| (frame, spec.fps)),
        );
        let centroids = animation_frames
            .iter()
            .filter_map(opaque_centroid)
            .collect::<Vec<_>>();
        let max_displacement_pixels = centroids
            .windows(2)
            .map(|pair| {
                let dx = pair[1].0 - pair[0].0;
                let dy = pair[1].1 - pair[0].1;
                (dx * dx + dy * dy).sqrt().round() as u32
            })
            .max()
            .unwrap_or(0);
        let palettes = animation_frames
            .iter()
            .map(frame_colors)
            .collect::<Vec<_>>();
        let palette_changes = palettes
            .windows(2)
            .map(|pair| pair[0].symmetric_difference(&pair[1]).count() as u32)
            .sum();
        let duplicate_frames = spec
            .frames
            .iter()
            .enumerate()
            .filter_map(|(local_index, source_index)| {
                prepared
                    .detection
                    .frames
                    .get(*source_index)
                    .and_then(|frame| frame.duplicate_of.map(|_| local_index))
            })
            .collect();
        animation_reports.push(AnimationInspection {
            name: spec.name.clone(),
            state: spec.state.clone(),
            direction: spec.direction.clone(),
            fps: spec.fps,
            loops: spec.loops,
            frame_count: animation_frames.len(),
            vram_bytes: prepared.report.bytes_per_frame_4bpp * animation_frames.len() as u32,
            objects_per_frame: metadata
                .frames
                .iter()
                .map(|frame| frame.tiles.len() as u32)
                .max()
                .unwrap_or(0),
            max_displacement_pixels,
            changed_pixels: animation_sources
                .iter()
                .zip(animation_frames)
                .map(|(source, output)| changed_pixels(source, output))
                .sum(),
            palette_changes,
            duplicate_frames,
        });
    }
    write_consolidated_gif(
        &output_directory.join("preview.gif"),
        &all_gif_frames,
        options.scale,
    )?;

    let halo_pixels = source_frames
        .iter()
        .flat_map(|frame| frame.pixels())
        .filter(|pixel| pixel[3] > 0 && pixel[3] < 255)
        .count() as u32;
    let cut_frames = source_frames
        .iter()
        .enumerate()
        .filter_map(|(index, frame)| {
            touches_edge(frame, prepared.report.profile.anchor).then_some(index)
        })
        .collect::<Vec<_>>();
    let animation_diagnostics = manifest
        .animations
        .iter()
        .zip(ranges.iter())
        .map(|(animation, range)| {
            animation_visual_diagnostics(
                &animation.name,
                range.start,
                &source_frames[range.clone()],
                prepared.report.profile.anchor,
            )
        })
        .collect::<Vec<_>>();
    let scale_drift_percent = animation_diagnostics
        .iter()
        .map(|diagnostic| diagnostic.scale_drift_percent)
        .fold(0.0, f32::max);
    let palette_set_variation_frames = animation_diagnostics
        .iter()
        .flat_map(|diagnostic| diagnostic.palette_set_variation_frames.iter().copied())
        .collect::<Vec<_>>();
    let diagnostics = VisualDiagnostics {
        halo_pixels,
        cut_frames,
        scale_drift_percent,
        palette_set_variation_frames,
        animation_diagnostics,
    };

    let mut exact_duplicate_frames = Vec::new();
    let mut mirrored_frames = Vec::new();
    let mut canonical_frames = Vec::<usize>::new();
    for (frame_index, frame) in frames.iter().enumerate() {
        if let Some(reuses) =
            (0..frame_index).find(|candidate| frames[*candidate].as_raw() == frame.as_raw())
        {
            exact_duplicate_frames.push(FrameReuse {
                frame: frame_index,
                reuses,
            });
            continue;
        }
        let mirrored = imageops::flip_horizontal(frame);
        if let Some(reuses) =
            (0..frame_index).find(|candidate| frames[*candidate].as_raw() == mirrored.as_raw())
        {
            mirrored_frames.push(FrameReuse {
                frame: frame_index,
                reuses,
            });
            continue;
        }
        canonical_frames.push(frame_index);
    }
    let original_vram_bytes = prepared.report.animation_bytes_4bpp;
    let optimized_vram_bytes = prepared
        .report
        .bytes_per_frame_4bpp
        .saturating_mul(canonical_frames.len() as u32);
    let optimization = OptimizationInspection {
        exact_duplicate_frames,
        mirrored_frames,
        original_vram_bytes,
        optimized_vram_bytes,
        saved_vram_bytes: original_vram_bytes.saturating_sub(optimized_vram_bytes),
        resource: resource_optimization,
    };

    let objects_per_frame = prepared
        .animations
        .iter()
        .flat_map(|animation| animation.frames.iter())
        .map(|frame| frame.tiles.len() as u32)
        .max()
        .unwrap_or(0);
    let scene_objects = metric(
        objects_per_frame.saturating_mul(options.scene_actor_count),
        96,
        128,
    );
    let scanline_objects = metric(
        objects_per_frame.saturating_mul(options.scene_actor_count),
        24,
        32,
    );
    let vram_bytes = metric(prepared.report.animation_bytes_4bpp, 24 * 1024, 32 * 1024);
    let visible_colors = metric(prepared.report.visible_colors as u32, 13, 15);
    let overall = worst_status([
        scene_objects.status,
        scanline_objects.status,
        vram_bytes.status,
        visible_colors.status,
    ]);
    let hardware = HardwareInspection {
        objects_per_frame,
        scene_objects,
        scanline_objects,
        vram_bytes,
        visible_colors,
        overall,
    };
    let generated_files = vec![
        "numbered.png",
        "hardware.png",
        "onion-skin.png",
        "before.png",
        "after.png",
        "comparison.png",
        "preview.gif",
        "inspector.json",
        "inspector.html",
    ]
    .into_iter()
    .map(str::to_string)
    .chain(
        manifest
            .animations
            .iter()
            .map(|animation| format!("{}.gif", safe_file_name(&animation.name))),
    )
    .collect::<Vec<_>>();
    let report = AnimationInspectorReport {
        schema_version: 1,
        animations: animation_reports,
        hardware,
        diagnostics,
        optimization,
        generated_files,
    };
    let report_bytes = serde_json::to_vec_pretty(&report)
        .map_err(|error| PrepError(format!("failed to serialize inspector report: {error}")))?;
    std::fs::write(output_directory.join("inspector.json"), report_bytes)
        .map_err(|error| PrepError(format!("failed to write inspector report: {error}")))?;
    std::fs::write(
        output_directory.join("inspector.html"),
        inspector_html(&report),
    )
    .map_err(|error| PrepError(format!("failed to write inspector HTML: {error}")))?;
    Ok(report)
}

pub fn inspector_directory_for(output_png: &Path) -> PathBuf {
    output_png
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("inspector")
}
