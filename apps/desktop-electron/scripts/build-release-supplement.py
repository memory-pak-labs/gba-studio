#!/usr/bin/env python3
"""Export tracked release source and the notices retained by the packaged runtime."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args])


def collect_runtime(runtime):
    entries = {}
    forbidden = {".p8", ".p12", ".pfx", ".key", ".pem", ".exe", ".dll", ".dylib", ".so", ".pyc"}
    for directory, directories, files in os.walk(runtime, followlinks=False):
        directories[:] = sorted(name for name in directories if not (Path(directory) / name).is_symlink())
        for name in sorted(files):
            source = Path(directory) / name
            relative = source.relative_to(runtime)
            parts = [part.lower() for part in relative.parts]
            selected = (any(part in {"licenses", "sources"} for part in parts[:-1])
                        or name.lower().startswith(("license", "copying", "copyright", "notice", "third_party", "sources"))
                        or relative.as_posix() == "Runtime/runtime.json")
            if not selected or source.suffix.lower() in forbidden or name.startswith(".env"):
                continue
            if source.is_symlink():
                raise ValueError(f"Refusing a symbolic link in runtime source/notices: {relative}")
            entries[f"bundled/{relative.as_posix()}"] = source.read_bytes()
    if not any("licenses/" in name.lower() for name in entries):
        raise ValueError("Runtime license directory missing")
    if not any("/sources/" in name.lower() for name in entries):
        raise ValueError("Runtime source directory missing")
    return entries


def build(repo, runtime, output, platform, allow_generated_icons=False):
    changed = set(filter(None, git(repo, "diff", "HEAD", "--name-only", "-z").decode().split("\0")))
    generated_icons = {f"apps/desktop-electron/build/{name}.{extension}"
                       for name in ("icon", "file-gbastudio") for extension in ("png", "ico", "icns")}
    unexpected = changed - (generated_icons if allow_generated_icons else set())
    if unexpected:
        raise ValueError("Commit tracked release changes before exporting corresponding source: " + ", ".join(sorted(unexpected)))
    commit = git(repo, "rev-parse", "HEAD").decode().strip()
    package_path = "apps/desktop-electron/package.json"
    package = json.loads(git(repo, "show", f"HEAD:{package_path}"))
    version = package["version"]
    entries = collect_runtime(runtime)
    # icons regenerates tracked build outputs differently on native hosts. Keep the
    # exact packaged bytes alongside the committed source icon and build recipe.
    for relative in sorted(changed):
        icon = repo / relative
        if icon.is_symlink() or not icon.is_file():
            raise ValueError(f"Invalid generated icon: {relative}")
        entries[f"generated/{relative}"] = icon.read_bytes()
    for relative in ["LICENSE", "THIRD_PARTY_NOTICES.md", package_path,
                     "apps/desktop-electron/package-lock.json",
                     "apps/desktop-electron/scripts/portable-runtime-sources.json"]:
        entries[f"repository/{relative}"] = git(repo, "show", f"HEAD:{relative}")
    archive_name = f"GBA-Studio-{version}-{commit[:12]}-source.tar.gz"
    entries[f"source/{archive_name}"] = git(repo, "archive", "--format=tar.gz", "--prefix=gba-studio/", "HEAD")
    entries["README.txt"] = (f"GBA Studio {version} — {platform}\nSource commit: {commit}\n"
        f"https://github.com/memory-pak-labs/gba-studio/tree/{commit}\n\n"
        "source/ contains the exact tracked editor/engine source, asset provenance, dependency lockfile and build recipes.\n"
        "bundled/ preserves original notices and the source files/archives retained in the packaged runtime.\n"
        "repository/apps/desktop-electron/scripts/portable-runtime-sources.json records upstream download hashes,\n"
        "compiler source locations and exact build/patch recipes. SOURCES.txt records Python/Pillow/make and host-tool sources.\n"
        "The full upstream compiler and host distribution source archives are NOT embedded in this supplement;\n"
        "retain equivalent access to the recorded corresponding sources alongside any public binary distribution.\n"
        "Independent tools retain their original licenses; the editor MIT license does not replace those licenses.\n"
        "MANIFEST.json hashes every other ZIP entry. This supplement contains no signing credentials or installed executables.\n").encode()
    manifest = {"schemaVersion": 1, "version": version, "commit": commit, "platform": platform,
                "generatedIconOverrides": sorted(changed),
                "entries": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                            for name, data in sorted(entries.items())]}
    entries["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(json.dumps({"output": str(output), "commit": commit, "entries": len(entries),
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--platform", choices=["macos-universal", "windows-x64", "linux-x64"], required=True)
    parser.add_argument("--allow-generated-icons", action="store_true", help="Retain the six known icon build outputs if regenerated")
    args = parser.parse_args()
    build(args.repo.resolve(), args.runtime.resolve(), args.output.resolve(), args.platform, args.allow_generated_icons)
