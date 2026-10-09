use gba_sprite_prep::{
    enrich_background_from_style, enrich_background_from_style_with_block,
    enrich_background_from_style_with_mask,
};
use image::{Rgba, RgbaImage};
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn enrichment_preserves_source_geometry_alpha_and_rgb555_palette_budget() {
    let mut source = RgbaImage::new(4, 2);
    let left = Rgba([16, 32, 48, 255]);
    let right = Rgba([192, 208, 160, 255]);
    for y in 0..2 {
        for x in 0..4 {
            source.put_pixel(x, y, if x < 2 { left } else { right });
        }
    }
    source.put_pixel(0, 0, Rgba([0, 0, 0, 0]));

    let style = RgbaImage::from_fn(8, 4, |x, y| {
        Rgba([
            (24 + x * 20) as u8,
            (40 + y * 36) as u8,
            (72 + (x + y) * 12) as u8,
            255,
        ])
    });

    let (output, report) = enrich_background_from_style(&source, &style, 4).unwrap();

    assert_eq!(output.dimensions(), source.dimensions());
    assert_eq!(report.source_color_classes, 2);
    assert!(report.output_colors <= 8);
    assert!(report.output_colors <= 16);
    assert_eq!(output.get_pixel(0, 0)[3], 0);
    for (source_pixel, output_pixel) in source.pixels().zip(output.pixels()) {
        assert_eq!(output_pixel[3], source_pixel[3]);
        if output_pixel[3] != 0 {
            assert_eq!(output_pixel[0] % 8, 0);
            assert_eq!(output_pixel[1] % 8, 0);
            assert_eq!(output_pixel[2] % 8, 0);
        }
    }

    let mut colors_by_source = BTreeMap::<[u8; 4], BTreeSet<[u8; 4]>>::new();
    for (source_pixel, output_pixel) in source.pixels().zip(output.pixels()) {
        if source_pixel[3] != 0 {
            colors_by_source
                .entry(source_pixel.0)
                .or_default()
                .insert(output_pixel.0);
        }
    }
    assert_eq!(colors_by_source.len(), 2);
    assert!(colors_by_source.values().all(|colors| colors.len() <= 4));
}

#[test]
fn enrichment_rejects_more_source_classes_than_the_bg_palette_can_encode() {
    let source = RgbaImage::from_fn(17, 1, |x, _| Rgba([x as u8 * 8, 0, 0, 255]));
    let style = source.clone();

    let error = enrich_background_from_style(&source, &style, 4).unwrap_err();

    assert!(error.contains("16"));
}

#[test]
fn enrichment_can_cluster_style_detail_without_changing_source_class_boundaries() {
    let source = RgbaImage::from_pixel(4, 2, Rgba([64, 96, 80, 255]));
    let style = RgbaImage::from_fn(4, 2, |x, y| {
        Rgba([(x * 56) as u8, (y * 96) as u8, (32 + x * 40) as u8, 255])
    });

    let (output, report) = enrich_background_from_style_with_block(&source, &style, 4, 2).unwrap();

    assert_eq!(report.texture_block, 2);
    assert_eq!(output.get_pixel(0, 0), output.get_pixel(1, 0));
    assert_eq!(output.get_pixel(0, 0), output.get_pixel(0, 1));
    assert_eq!(output.get_pixel(2, 0), output.get_pixel(3, 0));
    assert_eq!(output.get_pixel(2, 0), output.get_pixel(2, 1));
}

#[test]
fn repeated_dark_style_samples_do_not_collapse_to_the_brightest_shade() {
    let source = RgbaImage::from_pixel(8, 1, Rgba([16, 24, 32, 255]));
    let style = RgbaImage::from_fn(8, 1, |x, _| {
        if x == 7 {
            Rgba([224, 232, 240, 255])
        } else {
            Rgba([8, 16, 24, 255])
        }
    });

    let (output, _) = enrich_background_from_style_with_block(&source, &style, 4, 1).unwrap();

    for x in 0..7 {
        assert_eq!(output.get_pixel(x, 0).0, [8, 16, 24, 255]);
    }
    assert_eq!(output.get_pixel(7, 0).0, [224, 232, 240, 255]);
}

#[test]
fn semantic_mask_separates_materials_that_reuse_the_same_source_color() {
    let source = RgbaImage::from_pixel(4, 2, Rgba([96, 112, 80, 255]));
    let mask = RgbaImage::from_fn(4, 2, |x, _| {
        if x < 2 {
            Rgba([255, 0, 0, 255])
        } else {
            Rgba([0, 0, 255, 255])
        }
    });
    let style = RgbaImage::from_fn(4, 2, |x, y| {
        if x < 2 {
            Rgba([24 + y as u8 * 16, 144 + x as u8 * 8, 48, 255])
        } else {
            Rgba([168 + y as u8 * 16, 96, 32 + x as u8 * 8, 255])
        }
    });

    let (output, report) =
        enrich_background_from_style_with_mask(&source, &style, &mask, 4, 1).unwrap();

    assert_eq!(output.dimensions(), source.dimensions());
    assert_eq!(report.semantic_regions, 2);
    assert!(report.output_colors <= 8);
    assert_ne!(output.get_pixel(0, 0), output.get_pixel(3, 0));
    assert!(output
        .pixels()
        .all(|pixel| pixel[0] % 8 == 0 && pixel[1] % 8 == 0 && pixel[2] % 8 == 0));
}

#[test]
fn semantic_mask_rejects_incompatible_dimensions_and_unclassified_pixels() {
    let source = RgbaImage::from_pixel(4, 2, Rgba([64, 80, 96, 255]));
    let style = source.clone();
    let wrong_size = RgbaImage::from_pixel(3, 2, Rgba([255, 0, 0, 255]));

    let error =
        enrich_background_from_style_with_mask(&source, &style, &wrong_size, 4, 1).unwrap_err();
    assert!(error.contains("dimensoes"));

    let mut incomplete = RgbaImage::from_pixel(4, 2, Rgba([255, 0, 0, 255]));
    incomplete.put_pixel(2, 1, Rgba([0, 0, 0, 0]));
    let error =
        enrich_background_from_style_with_mask(&source, &style, &incomplete, 4, 1).unwrap_err();
    assert!(error.contains("classifica"));
}
