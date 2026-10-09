use image::{imageops, Rgba, RgbaImage};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundEnrichmentReport {
    pub width: u32,
    pub height: u32,
    pub source_color_classes: usize,
    pub semantic_regions: usize,
    pub shades_per_class: usize,
    pub texture_block: u32,
    pub output_colors: usize,
    pub rgb555_normalized: bool,
    pub source_alpha_preserved: bool,
}

fn gba_channel(channel: u8) -> u8 {
    (channel >> 3) << 3
}

fn gba_rgb(pixel: Rgba<u8>) -> [u8; 3] {
    [
        gba_channel(pixel[0]),
        gba_channel(pixel[1]),
        gba_channel(pixel[2]),
    ]
}

fn luminance(color: [u8; 3]) -> u32 {
    color[0] as u32 * 2126 + color[1] as u32 * 7152 + color[2] as u32 * 722
}

fn representative_shades(mut samples: Vec<[u8; 3]>, shade_count: usize) -> Vec<[u8; 3]> {
    samples.sort_by_key(|color| luminance(*color));
    samples.dedup();
    if samples.len() <= shade_count {
        return samples;
    }
    if shade_count == 1 {
        return vec![samples[samples.len() / 2]];
    }
    (0..shade_count)
        .map(|index| samples[index * (samples.len() - 1) / (shade_count - 1)])
        .collect()
}

pub fn enrich_background_from_style(
    source: &RgbaImage,
    style: &RgbaImage,
    requested_shades_per_class: usize,
) -> Result<(RgbaImage, BackgroundEnrichmentReport), String> {
    enrich_background_from_style_with_block(source, style, requested_shades_per_class, 1)
}

fn block_style_sample(
    class_map: &RgbaImage,
    style: &RgbaImage,
    x: u32,
    y: u32,
    class: [u8; 4],
    texture_block: u32,
) -> [u8; 3] {
    let start_x = x / texture_block * texture_block;
    let start_y = y / texture_block * texture_block;
    let end_x = (start_x + texture_block).min(class_map.width());
    let end_y = (start_y + texture_block).min(class_map.height());
    let mut totals = [0u32; 3];
    let mut count = 0u32;
    for sample_y in start_y..end_y {
        for sample_x in start_x..end_x {
            if class_map.get_pixel(sample_x, sample_y).0 == class {
                let pixel = style.get_pixel(sample_x, sample_y);
                totals[0] += pixel[0] as u32;
                totals[1] += pixel[1] as u32;
                totals[2] += pixel[2] as u32;
                count += 1;
            }
        }
    }
    if count == 0 {
        return gba_rgb(*style.get_pixel(x, y));
    }
    [
        gba_channel((totals[0] / count) as u8),
        gba_channel((totals[1] / count) as u8),
        gba_channel((totals[2] / count) as u8),
    ]
}

pub fn enrich_background_from_style_with_block(
    source: &RgbaImage,
    style: &RgbaImage,
    requested_shades_per_class: usize,
    requested_texture_block: u32,
) -> Result<(RgbaImage, BackgroundEnrichmentReport), String> {
    enrich_background_from_style_with_class_map(
        source,
        style,
        source,
        requested_shades_per_class,
        requested_texture_block,
    )
}

pub fn enrich_background_from_style_with_mask(
    source: &RgbaImage,
    style: &RgbaImage,
    semantic_mask: &RgbaImage,
    requested_shades_per_region: usize,
    requested_texture_block: u32,
) -> Result<(RgbaImage, BackgroundEnrichmentReport), String> {
    if source.dimensions() != semantic_mask.dimensions() {
        return Err(
            "A mascara semantica precisa ter as mesmas dimensoes do background de origem."
                .to_string(),
        );
    }
    if source
        .enumerate_pixels()
        .any(|(x, y, pixel)| pixel[3] != 0 && semantic_mask.get_pixel(x, y)[3] == 0)
    {
        return Err(
            "A mascara semantica precisa classificar todos os pixels visiveis do background."
                .to_string(),
        );
    }
    enrich_background_from_style_with_class_map(
        source,
        style,
        semantic_mask,
        requested_shades_per_region,
        requested_texture_block,
    )
}

fn enrich_background_from_style_with_class_map(
    source: &RgbaImage,
    style: &RgbaImage,
    class_map: &RgbaImage,
    requested_shades_per_class: usize,
    requested_texture_block: u32,
) -> Result<(RgbaImage, BackgroundEnrichmentReport), String> {
    if source.width() == 0 || source.height() == 0 || style.width() == 0 || style.height() == 0 {
        return Err("As imagens de fonte e estilo precisam ter dimensoes positivas.".to_string());
    }

    let mut pixels_by_class = BTreeMap::<[u8; 4], Vec<(u32, u32)>>::new();
    for (x, y, pixel) in source.enumerate_pixels() {
        if pixel[3] != 0 {
            pixels_by_class
                .entry(class_map.get_pixel(x, y).0)
                .or_default()
                .push((x, y));
        }
    }
    if pixels_by_class.is_empty() {
        return Err("O background de origem nao possui pixels visiveis.".to_string());
    }
    if pixels_by_class.len() > 16 {
        return Err(format!(
            "O mapa de classes possui {} regioes; o modo BG enriquecido aceita no maximo 16.",
            pixels_by_class.len()
        ));
    }

    let style = imageops::resize(
        style,
        source.width(),
        source.height(),
        imageops::FilterType::Triangle,
    );
    let shades_per_class = requested_shades_per_class
        .max(1)
        .min((16 / pixels_by_class.len()).max(1));
    let texture_block = requested_texture_block.max(1);
    let mut palettes = BTreeMap::<[u8; 4], Vec<[u8; 3]>>::new();

    for (class, coordinates) in &pixels_by_class {
        let samples = coordinates
            .iter()
            .map(|(x, y)| block_style_sample(class_map, &style, *x, *y, *class, texture_block))
            .collect::<Vec<_>>();
        palettes.insert(*class, representative_shades(samples, shades_per_class));
    }

    let mut output = RgbaImage::new(source.width(), source.height());
    for (x, y, source_pixel) in source.enumerate_pixels() {
        if source_pixel[3] == 0 {
            output.put_pixel(x, y, *source_pixel);
            continue;
        }
        let class = class_map.get_pixel(x, y).0;
        let palette = palettes.get(&class).expect("classe semantica cadastrada");
        let sample = block_style_sample(class_map, &style, x, y, class, texture_block);
        let color = *palette
            .iter()
            .min_by_key(|candidate| {
                let red = sample[0] as i32 - candidate[0] as i32;
                let green = sample[1] as i32 - candidate[1] as i32;
                let blue = sample[2] as i32 - candidate[2] as i32;
                2 * red * red + 4 * green * green + blue * blue
            })
            .expect("paleta de classe vazia");
        output.put_pixel(x, y, Rgba([color[0], color[1], color[2], source_pixel[3]]));
    }

    let output_colors = output
        .pixels()
        .filter(|pixel| pixel[3] != 0)
        .map(|pixel| [pixel[0], pixel[1], pixel[2]])
        .collect::<BTreeSet<_>>()
        .len();
    let report = BackgroundEnrichmentReport {
        width: output.width(),
        height: output.height(),
        source_color_classes: source
            .pixels()
            .filter(|pixel| pixel[3] != 0)
            .map(|pixel| pixel.0)
            .collect::<BTreeSet<_>>()
            .len(),
        semantic_regions: pixels_by_class.len(),
        shades_per_class,
        texture_block,
        output_colors,
        rgb555_normalized: output
            .pixels()
            .filter(|pixel| pixel[3] != 0)
            .all(|pixel| pixel[0] % 8 == 0 && pixel[1] % 8 == 0 && pixel[2] % 8 == 0),
        source_alpha_preserved: source
            .pixels()
            .zip(output.pixels())
            .all(|(source_pixel, output_pixel)| source_pixel[3] == output_pixel[3]),
    };
    Ok((output, report))
}
