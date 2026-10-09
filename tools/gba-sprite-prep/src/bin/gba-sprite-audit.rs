use gba_sprite_prep::{audit_sprite_source, load_sprite_pack_manifest, PrepError};
use std::path::{Path, PathBuf};

fn usage() -> &'static str {
    "Uso: gba-sprite-audit <sprite-pack.json>"
}

fn read_source(manifest_path: &Path, source: &str) -> Result<image::RgbaImage, PrepError> {
    let root = manifest_path.parent().unwrap_or_else(|| Path::new("."));
    let source_path = root.join(source);
    image::open(&source_path)
        .map_err(|error| {
            PrepError(format!(
                "failed to read input image '{}': {error}",
                source_path.display()
            ))
        })
        .map(|image| image.to_rgba8())
}

fn run() -> Result<(), PrepError> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [manifest_path] = args.as_slice() else {
        return Err(PrepError(usage().to_string()));
    };
    let manifest_path = PathBuf::from(manifest_path);
    let manifest = load_sprite_pack_manifest(&manifest_path)?;
    let source = read_source(&manifest_path, &manifest.source)?;
    let audit = audit_sprite_source(&source, &manifest)?;
    let output = serde_json::to_string_pretty(&audit)
        .map_err(|error| PrepError(format!("failed to serialize source audit: {error}")))?;
    println!("{output}");
    if audit.passed {
        Ok(())
    } else {
        Err(PrepError(format!(
            "source audit failed: {}",
            audit.violations.join(", ")
        )))
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
