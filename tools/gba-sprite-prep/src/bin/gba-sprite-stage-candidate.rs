use gba_sprite_prep::{
    stage_candidate_frames, CandidateFrameRegion, CandidateMatte, CandidatePalettePolicy, PrepError,
};
use std::path::PathBuf;

fn usage() -> &'static str {
    "Uso: gba-sprite-stage-candidate <entrada.png> <saida.png> --size <largura>x<altura> --region <x>,<y>,<largura>,<altura> [--region ...] [--matte-min N] [--matte-spread N] [--reduce-to-4bpp] [--report <relatorio.json>]"
}

fn parse_pair(value: &str, separator: char) -> Result<(u32, u32), PrepError> {
    let values = value
        .split(separator)
        .map(|part| part.trim().parse::<u32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| PrepError(format!("invalid dimensions '{value}'")))?;
    let [width, height] = values.as_slice() else {
        return Err(PrepError(format!("invalid dimensions '{value}'")));
    };
    Ok((*width, *height))
}

fn parse_region(value: &str) -> Result<CandidateFrameRegion, PrepError> {
    let values = value
        .split(',')
        .map(|part| part.trim().parse::<u32>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| PrepError(format!("invalid region '{value}'")))?;
    let [x, y, width, height] = values.as_slice() else {
        return Err(PrepError(format!("invalid region '{value}'")));
    };
    Ok(CandidateFrameRegion::new(*x, *y, *width, *height))
}

fn next_value<I>(args: &mut I, label: &str) -> Result<String, PrepError>
where
    I: Iterator<Item = String>,
{
    args.next()
        .ok_or_else(|| PrepError(format!("missing value for {label}")))
}

fn run() -> Result<(), PrepError> {
    let mut args = std::env::args().skip(1);
    let input = args.next().ok_or_else(|| PrepError(usage().to_string()))?;
    let output = args.next().ok_or_else(|| PrepError(usage().to_string()))?;
    let mut size = None;
    let mut regions = Vec::new();
    let mut matte_minimum_channel = 240;
    let mut matte_maximum_spread = 8;
    let mut reduce_to_4bpp = false;
    let mut report = None;

    while let Some(argument) = args.next() {
        match argument.as_str() {
            "--size" => size = Some(parse_pair(&next_value(&mut args, "--size")?, 'x')?),
            "--region" => regions.push(parse_region(&next_value(&mut args, "--region")?)?),
            "--matte-min" => {
                matte_minimum_channel =
                    next_value(&mut args, "--matte-min")?.parse().map_err(|_| {
                        PrepError("--matte-min must be an integer between 0 and 255".to_string())
                    })?;
            }
            "--matte-spread" => {
                matte_maximum_spread =
                    next_value(&mut args, "--matte-spread")?
                        .parse()
                        .map_err(|_| {
                            PrepError(
                                "--matte-spread must be an integer between 0 and 255".to_string(),
                            )
                        })?;
            }
            "--reduce-to-4bpp" => reduce_to_4bpp = true,
            "--report" => report = Some(PathBuf::from(next_value(&mut args, "--report")?)),
            _ => {
                return Err(PrepError(format!(
                    "unknown option '{argument}'\n{}",
                    usage()
                )))
            }
        }
    }

    let size = size.ok_or_else(|| PrepError("--size is required".to_string()))?;
    let input_path = PathBuf::from(input);
    let output_path = PathBuf::from(output);
    let source = image::open(&input_path)
        .map_err(|error| {
            PrepError(format!(
                "failed to read '{}': {error}",
                input_path.display()
            ))
        })?
        .to_rgba8();
    let (sheet, stage_report) = stage_candidate_frames(
        &source,
        &regions,
        size,
        CandidateMatte::light_neutral(matte_minimum_channel, matte_maximum_spread),
        if reduce_to_4bpp {
            CandidatePalettePolicy::ReduceTo4Bpp
        } else {
            CandidatePalettePolicy::Preserve
        },
    )?;
    sheet.save(&output_path).map_err(|error| {
        PrepError(format!(
            "failed to save '{}': {error}",
            output_path.display()
        ))
    })?;
    let serialized = serde_json::to_string_pretty(&stage_report)
        .map_err(|error| PrepError(format!("failed to serialize stage report: {error}")))?;
    if let Some(report_path) = report {
        std::fs::write(&report_path, &serialized).map_err(|error| {
            PrepError(format!(
                "failed to write '{}': {error}",
                report_path.display()
            ))
        })?;
    }
    println!("{serialized}");
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
