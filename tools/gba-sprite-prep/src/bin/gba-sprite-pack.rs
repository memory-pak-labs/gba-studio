use gba_sprite_prep::{
    load_sprite_pack_manifest, materialize_project_pack_copy, prepare_sprite_pack,
    render_preview_sheet, resolve_profile, write_animation_inspector, InspectorOptions, PrepError,
};
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Debug)]
struct Options {
    manifest: PathBuf,
    output_directory: PathBuf,
    snap: bool,
    pixel_size: Option<f64>,
    preview_scale: u32,
    scene_actor_count: Option<u32>,
    collision_width: Option<u32>,
    collision_height: Option<u32>,
    project: Option<PathBuf>,
    project_output: Option<PathBuf>,
    actor: Option<String>,
}

fn usage() -> &'static str {
    "Uso: gba-sprite-pack <sprite-pack.json> <diretorio-saida> [opcoes]\n\
     \n\
     Opcoes:\n\
       --no-snap          Pula a reconstrucao de grade\n\
       --pixel-size <px>  Sobrescreve a grade detectada pelo Pixel Snapper\n\
       --preview-scale N  Escala nearest-neighbor do preview (padrao: 8)\n\
       --scene-actors N   Sobrescreve o orcamento de atores do preset\n\
       --collision-width  Sobrescreve a largura de colisao do preset\n\
       --collision-height Sobrescreve a altura de colisao do preset\n\
       --project <arq>    Projeto .gba-project de origem\n\
       --project-output A Copia de projeto que recebera o pacote completo\n\
       --actor <id|nome>  Ator que recebera a primeira animacao do pacote\n\
       --help             Mostra esta ajuda"
}

fn value<T: std::str::FromStr>(
    args: &[String],
    index: &mut usize,
    flag: &str,
) -> Result<T, PrepError> {
    let raw = args
        .get(*index + 1)
        .ok_or_else(|| PrepError(format!("{flag} requires a value")))?;
    *index += 2;
    raw.parse()
        .map_err(|_| PrepError(format!("invalid value '{raw}' for {flag}")))
}

fn parse_args(args: Vec<String>) -> Result<Options, PrepError> {
    if args.len() < 3 {
        return Err(PrepError(usage().to_string()));
    }
    let mut options = Options {
        manifest: PathBuf::from(&args[1]),
        output_directory: PathBuf::from(&args[2]),
        snap: true,
        pixel_size: None,
        preview_scale: 8,
        scene_actor_count: None,
        collision_width: None,
        collision_height: None,
        project: None,
        project_output: None,
        actor: None,
    };
    let mut index = 3;
    while index < args.len() {
        match args[index].as_str() {
            "--no-snap" => {
                options.snap = false;
                index += 1;
            }
            "--pixel-size" => options.pixel_size = Some(value(&args, &mut index, "--pixel-size")?),
            "--preview-scale" => {
                options.preview_scale = value(&args, &mut index, "--preview-scale")?
            }
            "--scene-actors" => {
                options.scene_actor_count = Some(value(&args, &mut index, "--scene-actors")?)
            }
            "--collision-width" => {
                options.collision_width = Some(value(&args, &mut index, "--collision-width")?)
            }
            "--collision-height" => {
                options.collision_height = Some(value(&args, &mut index, "--collision-height")?)
            }
            "--project" => options.project = Some(value(&args, &mut index, "--project")?),
            "--project-output" => {
                options.project_output = Some(value(&args, &mut index, "--project-output")?)
            }
            "--actor" => options.actor = Some(value(&args, &mut index, "--actor")?),
            "--help" | "-h" => return Err(PrepError(usage().to_string())),
            unknown => {
                return Err(PrepError(format!(
                    "unknown option '{unknown}'\n\n{}",
                    usage()
                )))
            }
        }
    }
    if options.project.is_some() != options.project_output.is_some() {
        return Err(PrepError(
            "--project and --project-output must be provided together".to_string(),
        ));
    }
    if options.actor.is_some() && options.project.is_none() {
        return Err(PrepError(
            "--actor requires --project and --project-output".to_string(),
        ));
    }
    if options.preview_scale == 0
        || options.scene_actor_count == Some(0)
        || options.collision_width == Some(0)
        || options.collision_height == Some(0)
    {
        return Err(PrepError(
            "preview scale, scene actors and collision dimensions must be greater than zero"
                .to_string(),
        ));
    }
    Ok(options)
}

fn write_json(path: &Path, value: &impl serde::Serialize) -> Result<(), PrepError> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| PrepError(format!("failed to serialize '{}': {error}", path.display())))?;
    std::fs::write(path, bytes)
        .map_err(|error| PrepError(format!("failed to write '{}': {error}", path.display())))
}

fn run(options: Options) -> Result<(), PrepError> {
    let manifest = load_sprite_pack_manifest(&options.manifest)?;
    let scene_actor_count = options
        .scene_actor_count
        .or(manifest.scene_actor_count)
        .unwrap_or(1);
    let collision_width = options
        .collision_width
        .or(manifest.collision_width)
        .unwrap_or(16);
    let collision_height = options
        .collision_height
        .or(manifest.collision_height)
        .unwrap_or(16);
    let manifest_root = options.manifest.parent().unwrap_or_else(|| Path::new("."));
    let source_path = manifest_root.join(&manifest.source);
    let source = image::open(&source_path)
        .map_err(|error| {
            PrepError(format!(
                "failed to read input image '{}': {error}",
                source_path.display()
            ))
        })?
        .to_rgba8();
    let prepared = prepare_sprite_pack(&source, &manifest, options.snap, options.pixel_size)?;
    let sprite_sheet = prepared
        .animations
        .first()
        .map(|animation| animation.sprite_sheet.as_str())
        .ok_or_else(|| PrepError("prepared sprite pack has no animations".to_string()))?;
    std::fs::create_dir_all(&options.output_directory).map_err(|error| {
        PrepError(format!(
            "failed to create output directory '{}': {error}",
            options.output_directory.display()
        ))
    })?;
    let output_png = options.output_directory.join(sprite_sheet);
    if source_path.canonicalize().ok() == output_png.canonicalize().ok() && output_png.exists() {
        return Err(PrepError(
            "source image and output image must be different".to_string(),
        ));
    }
    prepared.sheet.save(&output_png).map_err(|error| {
        PrepError(format!(
            "failed to save '{}': {error}",
            output_png.display()
        ))
    })?;

    let stem = Path::new(sprite_sheet)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("sprite-pack");
    let report_path = options.output_directory.join(format!("{stem}.report.json"));
    write_json(
        &report_path,
        &json!({
            "schemaVersion": 1,
            "preparation": prepared.report,
            "detection": prepared.detection,
        }),
    )?;
    let metadata_path = options
        .output_directory
        .join(format!("{stem}.sprite-pack.json"));
    write_json(
        &metadata_path,
        &json!({
            "schemaVersion": manifest.schema_version,
            "name": manifest.name,
            "spriteSheet": sprite_sheet,
            "animations": prepared.animations,
            "sourceFrames": prepared.detection.frames,
        }),
    )?;
    let profile = resolve_profile(&manifest.profile, manifest.width.zip(manifest.height))?;
    let preview = render_preview_sheet(&prepared.sheet, &profile, options.preview_scale)?;
    let preview_path = options.output_directory.join(format!("{stem}.preview.png"));
    preview.save(&preview_path).map_err(|error| {
        PrepError(format!(
            "failed to save '{}': {error}",
            preview_path.display()
        ))
    })?;
    let inspector_path = options.output_directory.join("inspector");
    write_animation_inspector(
        &inspector_path,
        &source,
        &manifest,
        &prepared,
        &InspectorOptions {
            scale: options.preview_scale,
            scene_actor_count,
            collision_width,
            collision_height,
        },
    )?;

    if let (Some(project), Some(project_output)) = (
        options.project.as_deref(),
        options.project_output.as_deref(),
    ) {
        materialize_project_pack_copy(
            project,
            project_output,
            &output_png,
            &prepared.animations,
            options.actor.as_deref(),
        )?;
        println!("Projeto importado: {}", project_output.display());
    }

    println!("Pacote preparado: {}", output_png.display());
    println!("Relatorio: {}", report_path.display());
    println!("Metadados: {}", metadata_path.display());
    println!("Preview: {}", preview_path.display());
    println!("Inspector: {}", inspector_path.display());
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args
        .iter()
        .any(|arg| matches!(arg.as_str(), "--help" | "-h"))
    {
        println!("{}", usage());
        return;
    }
    if let Err(error) = parse_args(args).and_then(run) {
        eprintln!("Erro: {error}");
        std::process::exit(2);
    }
}
