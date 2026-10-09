use gba_sprite_prep::{
    build_animation_metadata, materialize_project_copy, prepare_frames, render_preview_sheet,
    resolve_profile, snap_frames_with_spritefusion_for_target, split_horizontal_frames,
    AnimationOptions, PrepError,
};
use std::path::{Path, PathBuf};

#[derive(Debug)]
struct CliOptions {
    input: PathBuf,
    output: PathBuf,
    profile: String,
    frame_count: usize,
    custom_width: Option<u32>,
    custom_height: Option<u32>,
    snap: bool,
    pixel_size_override: Option<f64>,
    report: Option<PathBuf>,
    metadata: Option<PathBuf>,
    preview: Option<PathBuf>,
    preview_scale: u32,
    animation_name: Option<String>,
    state: String,
    direction: String,
    fps: u32,
    loops: bool,
    project: Option<PathBuf>,
    project_output: Option<PathBuf>,
    actor: Option<String>,
}

fn usage() -> &'static str {
    "Uso: gba-sprite-prep <entrada> <saida.png> --profile <perfil> [opcoes]\n\
     \n\
     Opcoes:\n\
       --frames <n>       Quantidade de frames em uma faixa horizontal (padrao: 1)\n\
       --width <px>       Largura do frame para o perfil free/custom\n\
       --height <px>      Altura do frame para o perfil free/custom\n\
       --pixel-size <px>  Sobrescreve a grade detectada pelo Pixel Snapper\n\
       --no-snap          Pula a reconstrucao de grade para PNGs ja pixel-perfect\n\
       --report <arquivo> Caminho do relatorio JSON (padrao: <saida>.report.json)\n\
       --metadata <arq>   Caminho dos metadados (padrao: <saida>.animation.json)\n\
       --preview <arq>    Caminho do preview (padrao: <saida>.preview.png)\n\
       --preview-scale N  Escala nearest-neighbor do preview (padrao: 8)\n\
       --animation-name N Nome da animacao (padrao: nome do PNG)\n\
       --state <estado>   Estado da animacao (padrao: idle)\n\
       --direction <dir>  Direcao da animacao (padrao: down)\n\
       --fps <n>          Velocidade entre 1 e 60 (padrao: 8)\n\
       --no-loop          Marca a animacao como nao repetitiva\n\
       --project <arq>    Projeto .gba-project de origem para importar em uma copia\n\
       --project-output A Projeto .gba-project de destino (obrigatorio com --project)\n\
       --actor <id|nome>  Ator que recebera o sprite e a animacao\n\
       --help             Mostra esta ajuda\n\
     \n\
     Perfis: topdown, topdown-tall, platformer, platformer-wide, isometric,\n\
              dungeon-crawler, racing,\n\
              point-and-click, shmup, visual-novel, menu, cutscene,\n\
              world-map, battle-rpg, free"
}

fn parse_value<T: std::str::FromStr>(
    args: &[String],
    index: &mut usize,
    flag: &str,
) -> Result<T, PrepError> {
    let value = args
        .get(*index + 1)
        .ok_or_else(|| PrepError(format!("{flag} requires a value")))?;
    *index += 2;
    value
        .parse::<T>()
        .map_err(|_| PrepError(format!("invalid value '{value}' for {flag}")))
}

fn parse_args(args: Vec<String>) -> Result<CliOptions, PrepError> {
    if args.len() < 3 {
        return Err(PrepError(usage().to_string()));
    }
    let mut options = CliOptions {
        input: PathBuf::from(&args[1]),
        output: PathBuf::from(&args[2]),
        profile: String::new(),
        frame_count: 1,
        custom_width: None,
        custom_height: None,
        snap: true,
        pixel_size_override: None,
        report: None,
        metadata: None,
        preview: None,
        preview_scale: 8,
        animation_name: None,
        state: "idle".to_string(),
        direction: "down".to_string(),
        fps: 8,
        loops: true,
        project: None,
        project_output: None,
        actor: None,
    };

    let mut index = 3;
    while index < args.len() {
        match args[index].as_str() {
            "--profile" => options.profile = parse_value(&args, &mut index, "--profile")?,
            "--frames" => options.frame_count = parse_value(&args, &mut index, "--frames")?,
            "--width" => options.custom_width = Some(parse_value(&args, &mut index, "--width")?),
            "--height" => options.custom_height = Some(parse_value(&args, &mut index, "--height")?),
            "--pixel-size" => {
                options.pixel_size_override = Some(parse_value(&args, &mut index, "--pixel-size")?)
            }
            "--report" => options.report = Some(parse_value(&args, &mut index, "--report")?),
            "--metadata" => options.metadata = Some(parse_value(&args, &mut index, "--metadata")?),
            "--preview" => options.preview = Some(parse_value(&args, &mut index, "--preview")?),
            "--preview-scale" => {
                options.preview_scale = parse_value(&args, &mut index, "--preview-scale")?
            }
            "--animation-name" => {
                options.animation_name = Some(parse_value(&args, &mut index, "--animation-name")?)
            }
            "--state" => options.state = parse_value(&args, &mut index, "--state")?,
            "--direction" => options.direction = parse_value(&args, &mut index, "--direction")?,
            "--fps" => options.fps = parse_value(&args, &mut index, "--fps")?,
            "--project" => options.project = Some(parse_value(&args, &mut index, "--project")?),
            "--project-output" => {
                options.project_output = Some(parse_value(&args, &mut index, "--project-output")?)
            }
            "--actor" => options.actor = Some(parse_value(&args, &mut index, "--actor")?),
            "--no-snap" => {
                options.snap = false;
                index += 1;
            }
            "--no-loop" => {
                options.loops = false;
                index += 1;
            }
            "--help" | "-h" => return Err(PrepError(usage().to_string())),
            unknown => {
                return Err(PrepError(format!(
                    "unknown option '{unknown}'\n\n{}",
                    usage()
                )))
            }
        }
    }

    if options.profile.is_empty() {
        return Err(PrepError("--profile is required".to_string()));
    }
    if options.input == options.output {
        return Err(PrepError(
            "input and output paths must be different".to_string(),
        ));
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
    Ok(options)
}

fn sidecar_path(output: &Path, extension: &str) -> PathBuf {
    let mut sidecar = output.to_path_buf();
    sidecar.set_extension(extension);
    sidecar
}

fn ensure_parent(path: &Path, label: &str) -> Result<(), PrepError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|error| PrepError(format!("failed to create {label} directory: {error}")))?;
    }
    Ok(())
}

fn run(options: CliOptions) -> Result<(), PrepError> {
    let custom_size = options.custom_width.zip(options.custom_height);
    if options.custom_width.is_some() != options.custom_height.is_some() {
        return Err(PrepError(
            "--width and --height must be provided together".to_string(),
        ));
    }
    let profile = resolve_profile(&options.profile, custom_size)?;
    let source = image::open(&options.input)
        .map_err(|error| PrepError(format!("failed to read input image: {error}")))?
        .to_rgba8();
    let frames = split_horizontal_frames(&source, options.frame_count)?;
    let frames = if options.snap {
        snap_frames_with_spritefusion_for_target(
            &frames,
            profile.max_visible_colors,
            options.pixel_size_override,
            (profile.frame_width, profile.frame_height),
        )?
    } else {
        frames
    };
    let (sheet, report) = prepare_frames(&frames, &profile)?;
    let output_name = options
        .output
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| PrepError("output path requires a UTF-8 file name".to_string()))?;
    let animation_name = options.animation_name.unwrap_or_else(|| {
        options
            .output
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("animation")
            .to_string()
    });
    let metadata = build_animation_metadata(
        output_name,
        &profile,
        report.frame_count,
        &AnimationOptions {
            name: animation_name,
            state: options.state,
            direction: options.direction,
            fps: options.fps,
            loops: options.loops,
        },
    )?;
    let preview = render_preview_sheet(&sheet, &profile, options.preview_scale)?;

    ensure_parent(&options.output, "output")?;
    sheet
        .save(&options.output)
        .map_err(|error| PrepError(format!("failed to save prepared PNG: {error}")))?;

    let report_path = options
        .report
        .unwrap_or_else(|| sidecar_path(&options.output, "report.json"));
    ensure_parent(&report_path, "report")?;
    let report_json = serde_json::to_vec_pretty(&report)
        .map_err(|error| PrepError(format!("failed to serialize report: {error}")))?;
    std::fs::write(&report_path, report_json)
        .map_err(|error| PrepError(format!("failed to write report: {error}")))?;

    let metadata_path = options
        .metadata
        .unwrap_or_else(|| sidecar_path(&options.output, "animation.json"));
    ensure_parent(&metadata_path, "metadata")?;
    let metadata_json = serde_json::to_vec_pretty(&metadata)
        .map_err(|error| PrepError(format!("failed to serialize animation metadata: {error}")))?;
    std::fs::write(&metadata_path, metadata_json)
        .map_err(|error| PrepError(format!("failed to write animation metadata: {error}")))?;

    let preview_path = options
        .preview
        .unwrap_or_else(|| sidecar_path(&options.output, "preview.png"));
    ensure_parent(&preview_path, "preview")?;
    preview
        .save(&preview_path)
        .map_err(|error| PrepError(format!("failed to save preview PNG: {error}")))?;

    let imported_project = match (
        options.project.as_deref(),
        options.project_output.as_deref(),
    ) {
        (Some(source_project), Some(destination_project)) => {
            materialize_project_copy(
                source_project,
                destination_project,
                &options.output,
                &metadata,
                options.actor.as_deref(),
            )?;
            Some(destination_project)
        }
        _ => None,
    };

    println!(
        "Preparado: {} ({} frame(s), {}x{}, {} cores visiveis)",
        options.output.display(),
        report.frame_count,
        report.profile.frame_width,
        report.profile.frame_height,
        report.visible_colors
    );
    println!("Relatorio: {}", report_path.display());
    println!("Metadados: {}", metadata_path.display());
    println!("Preview: {}", preview_path.display());
    if let Some(project_path) = imported_project {
        println!("Projeto importado: {}", project_path.display());
    }
    for warning in &report.warnings {
        println!("Aviso: {warning}");
    }
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
