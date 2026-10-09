use gba_sprite_prep::{run_sprite_batch, PrepError};
use std::path::PathBuf;

fn usage() -> &'static str {
    "Uso: gba-sprite-batch <batch.json> <diretorio-saida>"
}

fn run(args: Vec<String>) -> Result<(), PrepError> {
    if args.len() != 3 {
        return Err(PrepError(usage().to_string()));
    }
    let report = run_sprite_batch(&PathBuf::from(&args[1]), &PathBuf::from(&args[2]))?;
    println!(
        "Batch concluido: {} sucesso(s), {} erro(s), {} importado(s)",
        report.succeeded, report.failed, report.imported
    );
    println!("Relatorio: {}/batch-report.json", args[2]);
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
    if let Err(error) = run(args) {
        eprintln!("Erro: {error}");
        std::process::exit(2);
    }
}
