use image::{Rgba, RgbaImage};
use std::process::Command;

#[test]
fn cli_applies_a_semantic_mask_and_reports_the_regions() {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("gba-bg-enrich-cli-test-{nonce}"));
    std::fs::create_dir_all(&root).unwrap();
    let source_path = root.join("source.png");
    let style_path = root.join("style.png");
    let mask_path = root.join("mask.png");
    let output_path = root.join("output.png");
    let report_path = root.join("report.json");

    RgbaImage::from_pixel(4, 2, Rgba([72, 88, 96, 255]))
        .save(&source_path)
        .unwrap();
    RgbaImage::from_fn(4, 2, |x, _| {
        if x < 2 {
            Rgba([24, 160, 48, 255])
        } else {
            Rgba([184, 104, 32, 255])
        }
    })
    .save(&style_path)
    .unwrap();
    RgbaImage::from_fn(4, 2, |x, _| {
        if x < 2 {
            Rgba([255, 0, 0, 255])
        } else {
            Rgba([0, 0, 255, 255])
        }
    })
    .save(&mask_path)
    .unwrap();

    let result = Command::new(env!("CARGO_BIN_EXE_gba-bg-enrich"))
        .arg(&source_path)
        .arg(&style_path)
        .arg(&output_path)
        .arg("--semantic-mask")
        .arg(&mask_path)
        .arg("--report")
        .arg(&report_path)
        .output()
        .expect("run gba-bg-enrich");

    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(output_path.is_file());
    let report: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&report_path).unwrap()).unwrap();
    assert_eq!(report["semanticRegions"], 2);
    assert!(report["outputColors"].as_u64().unwrap() <= 8);

    std::fs::remove_dir_all(root).unwrap();
}
