use crate::{
    load_sprite_pack_manifest, materialize_project_pack_copy, prepare_sprite_pack,
    render_preview_sheet, resolve_profile, write_animation_inspector, AnimationInspectorReport,
    BudgetStatus, InspectorOptions, PrepError,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpriteBatchManifest {
    schema_version: u32,
    #[serde(default = "default_true")]
    snap: bool,
    #[serde(default)]
    pixel_size: Option<f64>,
    #[serde(default = "default_preview_scale")]
    preview_scale: u32,
    #[serde(default)]
    scene_actor_count: Option<u32>,
    #[serde(default)]
    collision_width: Option<u32>,
    #[serde(default)]
    collision_height: Option<u32>,
    assets: Vec<SpriteBatchAsset>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpriteBatchAsset {
    manifest: String,
    #[serde(default)]
    approved: bool,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    actor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteBatchItemReport {
    pub manifest: String,
    pub name: String,
    pub approved: bool,
    pub status: String,
    pub output_directory: Option<String>,
    pub project_imported: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteBatchReport {
    pub schema_version: u32,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub imported: usize,
    pub items: Vec<SpriteBatchItemReport>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchInspectorItem {
    name: String,
    status: String,
    approved: bool,
    inspector: Option<String>,
    overall: Option<BudgetStatus>,
    animation_count: usize,
    frame_count: usize,
    error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchInspectorReport {
    schema_version: u32,
    total: usize,
    safe: usize,
    attention: usize,
    impossible: usize,
    failed: usize,
    items: Vec<BatchInspectorItem>,
}

#[derive(Debug)]
struct ProcessedBatchAsset {
    name: String,
    output_directory: PathBuf,
    imported: bool,
    inspector: AnimationInspectorReport,
}

fn default_true() -> bool {
    true
}

fn default_preview_scale() -> u32 {
    8
}

fn safe_name(value: &str) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let collapsed = normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "sprite".to_string()
    } else {
        collapsed
    }
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), PrepError> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| PrepError(format!("failed to serialize '{}': {error}", path.display())))?;
    std::fs::write(path, bytes)
        .map_err(|error| PrepError(format!("failed to write '{}': {error}", path.display())))
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn budget_status_name(status: BudgetStatus) -> &'static str {
    match status {
        BudgetStatus::Safe => "safe",
        BudgetStatus::Attention => "attention",
        BudgetStatus::Impossible => "impossible",
    }
}

fn write_batch_inspector(
    output_root: &Path,
    items: Vec<BatchInspectorItem>,
) -> Result<(), PrepError> {
    let safe = items
        .iter()
        .filter(|item| item.overall == Some(BudgetStatus::Safe))
        .count();
    let attention = items
        .iter()
        .filter(|item| item.overall == Some(BudgetStatus::Attention))
        .count();
    let impossible = items
        .iter()
        .filter(|item| item.overall == Some(BudgetStatus::Impossible))
        .count();
    let failed = items.iter().filter(|item| item.status == "error").count();
    let report = BatchInspectorReport {
        schema_version: 1,
        total: items.len(),
        safe,
        attention,
        impossible,
        failed,
        items,
    };
    let inspector_directory = output_root.join("inspector");
    std::fs::create_dir_all(&inspector_directory).map_err(|error| {
        PrepError(format!(
            "failed to create batch inspector '{}': {error}",
            inspector_directory.display()
        ))
    })?;
    write_json(&inspector_directory.join("batch-inspector.json"), &report)?;

    let cards = report
        .items
        .iter()
        .map(|item| {
            let status = item
                .overall
                .map(budget_status_name)
                .unwrap_or("error");
            let title = escape_html(&item.name);
            let detail = if let Some(error) = item.error.as_deref() {
                format!("<p class=\"error-message\">{}</p>", escape_html(error))
            } else {
                format!(
                    "<p>{} animação(ões) · {} frame(s) · {}</p>",
                    item.animation_count,
                    item.frame_count,
                    if item.approved { "aprovado" } else { "rascunho" }
                )
            };
            let link = item
                .inspector
                .as_deref()
                .map(|path| {
                    format!(
                        "<a href=\"{}\">Abrir Inspector</a>",
                        escape_html(path)
                    )
                })
                .unwrap_or_default();
            format!(
                "<article class=\"card {status}\"><header><h2>{title}</h2><span>{status}</span></header>{detail}{link}</article>"
            )
        })
        .collect::<String>();
    let html = format!(
        "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"icon\" href=\"data:,\"><title>Inspector do lote</title><style>\
         :root{{color-scheme:dark;background:#10131a;color:#f3f5f7;font-family:system-ui,sans-serif}}\
         body{{max-width:1040px;margin:0 auto;padding:32px}}h1{{margin-bottom:8px}}.summary{{color:#aeb8c7;margin-bottom:28px}}\
         .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}}\
         .card{{border:1px solid #303849;border-left-width:5px;border-radius:10px;padding:16px;background:#181d27}}\
         .card.safe{{border-left-color:#53d769}}.card.attention{{border-left-color:#ffcc45}}.card.impossible,.card.error{{border-left-color:#ff5f57}}\
         header{{display:flex;align-items:center;justify-content:space-between;gap:12px}}h2{{font-size:18px;margin:0}}span{{text-transform:uppercase;font-size:11px;letter-spacing:.08em}}\
         p{{color:#b8c0ce}}.error-message{{color:#ff9a95}}a{{color:#72c7ff}}</style></head><body>\
         <h1>Inspector do lote</h1><p class=\"summary\">{} pacote(s) · {} seguro(s) · {} atenção · {} inviável(is) · {} erro(s)</p>\
         <main class=\"grid\">{cards}</main></body></html>",
        report.total, report.safe, report.attention, report.impossible, report.failed
    );
    std::fs::write(inspector_directory.join("index.html"), html)
        .map_err(|error| PrepError(format!("failed to write batch inspector HTML: {error}")))
}

fn ensure_empty_output(path: &Path) -> Result<(), PrepError> {
    if path.is_dir()
        && std::fs::read_dir(path)
            .map_err(|error| {
                PrepError(format!(
                    "failed to inspect batch output '{}': {error}",
                    path.display()
                ))
            })?
            .next()
            .is_some()
    {
        return Err(PrepError(format!(
            "batch output directory must be empty: {}",
            path.display()
        )));
    }
    std::fs::create_dir_all(path).map_err(|error| {
        PrepError(format!(
            "failed to create batch output '{}': {error}",
            path.display()
        ))
    })
}

fn process_batch_asset(
    batch_root: &Path,
    output_root: &Path,
    options: &SpriteBatchManifest,
    asset: &SpriteBatchAsset,
) -> Result<ProcessedBatchAsset, PrepError> {
    let manifest_path = batch_root.join(&asset.manifest);
    let manifest = load_sprite_pack_manifest(&manifest_path)?;
    let manifest_root = manifest_path.parent().unwrap_or(batch_root);
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
    let output_name = safe_name(&manifest.name);
    let output_directory = output_root.join(&output_name);
    if output_directory.exists() {
        return Err(PrepError(format!(
            "batch asset output already exists: {}",
            output_directory.display()
        )));
    }
    std::fs::create_dir_all(&output_directory).map_err(|error| {
        PrepError(format!(
            "failed to create asset output '{}': {error}",
            output_directory.display()
        ))
    })?;
    let sprite_sheet = prepared
        .animations
        .first()
        .map(|animation| animation.sprite_sheet.clone())
        .ok_or_else(|| PrepError("prepared sprite pack has no animations".to_string()))?;
    let output_png = output_directory.join(&sprite_sheet);
    prepared.sheet.save(&output_png).map_err(|error| {
        PrepError(format!(
            "failed to save prepared sprite '{}': {error}",
            output_png.display()
        ))
    })?;
    write_json(
        &output_directory.join(format!("{output_name}.report.json")),
        &json!({
            "schemaVersion": 1,
            "preparation": prepared.report,
            "detection": prepared.detection,
        }),
    )?;
    write_json(
        &output_directory.join(format!("{output_name}.sprite-pack.json")),
        &json!({
            "schemaVersion": manifest.schema_version,
            "name": manifest.name,
            "spriteSheet": sprite_sheet,
            "animations": prepared.animations,
            "sourceFrames": prepared.detection.frames,
        }),
    )?;
    let profile = resolve_profile(&manifest.profile, manifest.width.zip(manifest.height))?;
    render_preview_sheet(&prepared.sheet, &profile, options.preview_scale)?
        .save(output_directory.join(format!("{output_name}.preview.png")))
        .map_err(|error| PrepError(format!("failed to save batch preview: {error}")))?;
    let inspector = write_animation_inspector(
        &output_directory.join("inspector"),
        &source,
        &manifest,
        &prepared,
        &InspectorOptions {
            scale: options.preview_scale,
            scene_actor_count: options
                .scene_actor_count
                .or(manifest.scene_actor_count)
                .unwrap_or(1),
            collision_width: options
                .collision_width
                .or(manifest.collision_width)
                .unwrap_or(16),
            collision_height: options
                .collision_height
                .or(manifest.collision_height)
                .unwrap_or(16),
        },
    )?;

    let mut imported = false;
    if asset.approved {
        if let Some(project) = asset.project.as_deref() {
            let source_project = batch_root.join(project);
            let file_name = source_project
                .file_name()
                .ok_or_else(|| PrepError("batch project requires a file name".to_string()))?;
            let destination_project = output_directory.join("project").join(file_name);
            materialize_project_pack_copy(
                &source_project,
                &destination_project,
                &output_png,
                &prepared.animations,
                asset.actor.as_deref(),
            )?;
            imported = true;
        }
    }
    Ok(ProcessedBatchAsset {
        name: output_name,
        output_directory,
        imported,
        inspector,
    })
}

pub fn run_sprite_batch(
    batch_manifest_path: &Path,
    output_directory: &Path,
) -> Result<SpriteBatchReport, PrepError> {
    ensure_empty_output(output_directory)?;
    let bytes = std::fs::read(batch_manifest_path).map_err(|error| {
        PrepError(format!(
            "failed to read batch manifest '{}': {error}",
            batch_manifest_path.display()
        ))
    })?;
    let manifest: SpriteBatchManifest = serde_json::from_slice(&bytes)
        .map_err(|error| PrepError(format!("invalid sprite batch JSON: {error}")))?;
    if manifest.schema_version != 1 {
        return Err(PrepError(format!(
            "unsupported sprite batch schemaVersion {}; expected 1",
            manifest.schema_version
        )));
    }
    if manifest.assets.is_empty() {
        return Err(PrepError(
            "sprite batch requires at least one asset".to_string(),
        ));
    }
    if manifest.preview_scale == 0
        || manifest.scene_actor_count == Some(0)
        || manifest.collision_width == Some(0)
        || manifest.collision_height == Some(0)
    {
        return Err(PrepError(
            "sprite batch scale, scene actors and collision dimensions must be greater than zero"
                .to_string(),
        ));
    }
    let batch_root = batch_manifest_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let mut items = Vec::with_capacity(manifest.assets.len());
    let mut inspector_items = Vec::with_capacity(manifest.assets.len());
    for asset in &manifest.assets {
        let fallback_name = load_sprite_pack_manifest(&batch_root.join(&asset.manifest))
            .map(|manifest| safe_name(&manifest.name))
            .unwrap_or_else(|_| {
                Path::new(&asset.manifest)
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .unwrap_or("sprite")
                    .to_string()
            });
        match process_batch_asset(batch_root, output_directory, &manifest, asset) {
            Ok(processed) => {
                inspector_items.push(BatchInspectorItem {
                    name: processed.name.clone(),
                    status: "ok".to_string(),
                    approved: asset.approved,
                    inspector: Some(format!("../{}/inspector/inspector.html", processed.name)),
                    overall: Some(processed.inspector.hardware.overall),
                    animation_count: processed.inspector.animations.len(),
                    frame_count: processed
                        .inspector
                        .animations
                        .iter()
                        .map(|animation| animation.frame_count)
                        .sum(),
                    error: None,
                });
                items.push(SpriteBatchItemReport {
                    manifest: asset.manifest.clone(),
                    name: processed.name,
                    approved: asset.approved,
                    status: "ok".to_string(),
                    output_directory: Some(processed.output_directory.display().to_string()),
                    project_imported: processed.imported,
                    error: None,
                });
            }
            Err(error) => {
                inspector_items.push(BatchInspectorItem {
                    name: fallback_name.clone(),
                    status: "error".to_string(),
                    approved: asset.approved,
                    inspector: None,
                    overall: None,
                    animation_count: 0,
                    frame_count: 0,
                    error: Some(error.to_string()),
                });
                items.push(SpriteBatchItemReport {
                    manifest: asset.manifest.clone(),
                    name: fallback_name,
                    approved: asset.approved,
                    status: "error".to_string(),
                    output_directory: None,
                    project_imported: false,
                    error: Some(error.to_string()),
                });
            }
        }
    }
    let succeeded = items.iter().filter(|item| item.status == "ok").count();
    let failed = items.len() - succeeded;
    let imported = items.iter().filter(|item| item.project_imported).count();
    let report = SpriteBatchReport {
        schema_version: 1,
        total: items.len(),
        succeeded,
        failed,
        imported,
        items,
    };
    write_json(&output_directory.join("batch-report.json"), &report)?;
    write_batch_inspector(output_directory, inspector_items)?;
    Ok(report)
}
