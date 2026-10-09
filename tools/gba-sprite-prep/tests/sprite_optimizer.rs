use gba_sprite_prep::{optimize_sprite_resources, SpriteOptimizationOptions};
use image::{imageops, Rgba, RgbaImage};

fn frame_with_tile_colors(colors: &[[u8; 4]; 4]) -> RgbaImage {
    let mut frame = RgbaImage::new(16, 16);
    for tile_y in 0u32..2 {
        for tile_x in 0u32..2 {
            let color = colors[(tile_y * 2 + tile_x) as usize];
            for y in tile_y * 8..(tile_y + 1) * 8 {
                for x in tile_x * 8..(tile_x + 1) * 8 {
                    frame.put_pixel(x, y, Rgba(color));
                }
            }
        }
    }
    frame
}

#[test]
fn reuses_exact_obj_tiles_without_changing_visual_data() {
    let colors = [
        [24, 72, 96, 255],
        [216, 128, 72, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];
    let frame = frame_with_tile_colors(&colors);
    let report = optimize_sprite_resources(&[frame.clone(), frame], &Default::default())
        .expect("same-size frames must be optimizable");

    assert_eq!(report.frame_width, 16);
    assert_eq!(report.frame_height, 16);
    assert_eq!(report.tiles_per_frame, 4);
    assert_eq!(report.unique_tiles_before, 8);
    assert_eq!(report.unique_tiles_after, 3);
    assert_eq!(report.reused_tile_count, 5);
    assert_eq!(report.saved_tile_bytes, 5 * 32);
    assert_eq!(report.visual_error_pixels, 0);
    assert_eq!(report.anchor_adjustments, 0);
    assert_eq!(report.palette_changes, 0);
}

#[test]
fn does_not_merge_similar_but_different_obj_tiles() {
    let first = frame_with_tile_colors(&[
        [24, 72, 96, 255],
        [216, 128, 72, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ]);
    let second = frame_with_tile_colors(&[
        [25, 72, 96, 255],
        [216, 128, 72, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ]);
    let report = optimize_sprite_resources(&[first, second], &Default::default())
        .expect("same-size frames must be optimizable");

    assert_eq!(report.unique_tiles_after, 4);
    assert_eq!(report.visual_error_pixels, 0);
}

#[test]
fn mirrored_frame_reuse_requires_explicit_opt_in() {
    let frame = frame_with_tile_colors(&[
        [24, 72, 96, 255],
        [216, 128, 72, 255],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ]);
    let mirrored = imageops::flip_horizontal(&frame);

    let conservative =
        optimize_sprite_resources(&[frame.clone(), mirrored.clone()], &Default::default())
            .expect("same-size frames must be optimizable");
    assert!(conservative.mirrored_frame_reuses.is_empty());

    let permissive = optimize_sprite_resources(
        &[frame, mirrored],
        &SpriteOptimizationOptions {
            allow_mirrored_frames: true,
        },
    )
    .expect("same-size frames must be optimizable");
    assert_eq!(permissive.mirrored_frame_reuses.len(), 1);
}

#[test]
fn rejects_mixed_frame_geometry_instead_of_resizing_it() {
    let first = RgbaImage::new(16, 16);
    let second = RgbaImage::new(32, 16);

    let error = optimize_sprite_resources(&[first, second], &Default::default())
        .expect_err("optimizer must reject mixed geometry");

    assert!(error.to_string().contains("same dimensions"));
}
