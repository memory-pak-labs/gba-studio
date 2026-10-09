use gba_sprite_prep::{
    stage_candidate_frames, CandidateFrameRegion, CandidateMatte, CandidatePalettePolicy,
};
use image::{Rgba, RgbaImage};

fn checkerboard(width: u32, height: u32) -> RgbaImage {
    let mut image = RgbaImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let value = if (x + y) % 2 == 0 { 248 } else { 255 };
            image.put_pixel(x, y, Rgba([value, value, value, 255]));
        }
    }
    image
}

#[test]
fn stages_declared_frames_while_removing_only_the_connected_light_matte() {
    let mut source = checkerboard(16, 8);

    for y in 2..7 {
        for x in 1..6 {
            source.put_pixel(x, y, Rgba([24, 48, 120, 255]));
            source.put_pixel(x + 8, y, Rgba([0, 136, 176, 255]));
        }
    }
    source.put_pixel(3, 4, Rgba([255, 255, 255, 255]));
    source.put_pixel(11, 4, Rgba([255, 160, 0, 255]));

    let (sheet, report) = stage_candidate_frames(
        &source,
        &[
            CandidateFrameRegion::new(0, 0, 8, 8),
            CandidateFrameRegion::new(8, 0, 8, 8),
        ],
        (8, 8),
        CandidateMatte::light_neutral(240, 8),
        CandidatePalettePolicy::Preserve,
    )
    .expect("staged candidate sheet");

    assert_eq!(sheet.dimensions(), (16, 8));
    assert_eq!(sheet.get_pixel(0, 0)[3], 0, "checkerboard matte must clear");
    assert_eq!(
        sheet.get_pixel(3, 4),
        &Rgba([255, 255, 255, 255]),
        "inner white highlight must remain"
    );
    assert_eq!(sheet.get_pixel(11, 4), &Rgba([255, 160, 0, 255]));
    assert_eq!(report.frame_count, 2);
    assert!(report.cleared_matte_pixels > 0);
    assert_eq!(report.visible_colors_before_palette, 4);
    assert_eq!(report.visible_colors, 4);
    assert!(!report.palette_reduced);
}
