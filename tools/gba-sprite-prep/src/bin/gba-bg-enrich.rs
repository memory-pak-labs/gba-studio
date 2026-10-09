use gba_sprite_prep::{
    enrich_background_from_style_with_block, enrich_background_from_style_with_mask,
};
use std::env;
use std::fs;
use std::path::PathBuf;

fn usage() -> ! {
    eprintln!("Uso: gba-bg-enrich <origem.png> <estilo.png> <saida.png> [--semantic-mask mascara.png] [--shades-per-class N] [--texture-block N] [--report relatorio.json]");
    std::process::exit(2);
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let source_path = PathBuf::from(args.next().unwrap_or_else(|| usage()));
    let style_path = PathBuf::from(args.next().unwrap_or_else(|| usage()));
    let output_path = PathBuf::from(args.next().unwrap_or_else(|| usage()));
    let mut shades_per_class = 4usize;
    let mut texture_block = 1u32;
    let mut semantic_mask_path = None;
    let mut report_path = None;
    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--shades-per-class" => {
                shades_per_class = args.next().unwrap_or_else(|| usage()).parse()?;
            }
            "--texture-block" => {
                texture_block = args.next().unwrap_or_else(|| usage()).parse()?;
            }
            "--semantic-mask" => {
                semantic_mask_path = Some(PathBuf::from(args.next().unwrap_or_else(|| usage())));
            }
            "--report" => report_path = Some(PathBuf::from(args.next().unwrap_or_else(|| usage()))),
            _ => usage(),
        }
    }

    let source = image::open(&source_path)?.to_rgba8();
    let style = image::open(&style_path)?.to_rgba8();
    let result = if let Some(semantic_mask_path) = semantic_mask_path {
        let semantic_mask = image::open(semantic_mask_path)?.to_rgba8();
        enrich_background_from_style_with_mask(
            &source,
            &style,
            &semantic_mask,
            shades_per_class,
            texture_block,
        )
    } else {
        enrich_background_from_style_with_block(&source, &style, shades_per_class, texture_block)
    };
    let (output, report) =
        result.map_err(|message| std::io::Error::new(std::io::ErrorKind::InvalidInput, message))?;
    output.save(&output_path)?;
    if let Some(report_path) = report_path {
        fs::write(
            report_path,
            format!("{}\n", serde_json::to_string_pretty(&report)?),
        )?;
    }
    println!("{}", serde_json::to_string(&report)?);
    Ok(())
}
