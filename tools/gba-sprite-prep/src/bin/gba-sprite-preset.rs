use gba_sprite_prep::{
    builtin_sprite_presets, resolve_sprite_preset, save_sprite_preset, PrepError,
};
use std::path::PathBuf;

fn usage() -> &'static str {
    "Uso:\n  gba-sprite-preset list\n  gba-sprite-preset show <nome>\n  gba-sprite-preset export <nome> <preset.json>"
}

fn print_json(value: &impl serde::Serialize) -> Result<(), PrepError> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| PrepError(format!("failed to serialize sprite preset: {error}")))?;
    println!("{json}");
    Ok(())
}

fn run() -> Result<(), PrepError> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match args.as_slice() {
        [command] if command == "list" => print_json(&builtin_sprite_presets()),
        [command, name] if command == "show" => print_json(&resolve_sprite_preset(name)?),
        [command, name, output] if command == "export" => {
            let preset = resolve_sprite_preset(name)?;
            let output = PathBuf::from(output);
            if output.exists() {
                return Err(PrepError(format!(
                    "sprite preset output already exists: {}",
                    output.display()
                )));
            }
            save_sprite_preset(&output, &preset)?;
            println!("Preset salvo em {}", output.display());
            Ok(())
        }
        _ => Err(PrepError(usage().to_string())),
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
