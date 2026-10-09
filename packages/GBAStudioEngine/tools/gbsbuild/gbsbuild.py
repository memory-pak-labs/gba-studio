#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


VERSION = "gbsbuild 2.25.0"
VARIANT_CACHE_ENTRIES = 8
VARIANT_CACHE_BYTES = 512 * 1024 * 1024


def absolute_path(value):
    return Path(value).expanduser().resolve()


def require_path(path, description):
    if not path.exists():
        raise SystemExit(f"{description} nao encontrado: {path}")


def load_project_manifest(project_dir):
    manifest_path = project_dir / "gbastudio_project.json"
    if not manifest_path.exists():
        return {}
    try:
        with manifest_path.open("r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"gbastudio_project.json invalido: {error}")
    return manifest if isinstance(manifest, dict) else {}


def manifest_build_value(manifest, key):
    build_config = manifest.get("build", {})
    if not isinstance(build_config, dict):
        return None
    value = build_config.get(key)
    return value if isinstance(value, str) and value else None


def manifest_header_value(manifest, key, default, pattern, description):
    value = manifest_build_value(manifest, key) or default
    if re.fullmatch(pattern, value) is None:
        raise SystemExit(f"{description} invalido no gbastudio_project.json: {value!r}")
    return value


def manifest_build_sources(manifest):
    build_config = manifest.get("build", {})
    if not isinstance(build_config, dict):
        return []
    sources = build_config.get("sources", [])
    if not isinstance(sources, list):
        return []
    return [source for source in sources if isinstance(source, str) and re.fullmatch(r"[A-Za-z0-9_.-]+\.cpp", source)]


def positive_jobs(value):
    try:
        jobs = int(value)
    except (TypeError, ValueError):
        raise argparse.ArgumentTypeError("jobs precisa ser um inteiro positivo")
    if jobs < 1:
        raise argparse.ArgumentTypeError("jobs precisa ser um inteiro positivo")
    return jobs


def build_make_invocation(args):
    engine_pack = absolute_path(args.engine_pack)
    project_dir = absolute_path(args.project_dir)
    build_dir = absolute_path(args.build_dir) if args.build_dir else project_dir / "build"
    makefile = engine_pack / "templates" / "Makefile.gba"
    engine_lib = engine_pack / "lib" / "libgbastudio_engine.a"
    manifest = load_project_manifest(project_dir)
    target = args.target or manifest_build_value(manifest, "target") or os.environ.get("GBS_TARGET") or "game"
    if re.fullmatch(r"[A-Za-z0-9_-]+", target) is None:
        raise SystemExit(f"Target invalido: {target!r}")
    make_target = args.make_target or manifest_build_value(manifest, "make_target") or "all"
    rom_title = manifest_header_value(manifest, "rom_title", "GBS_GAME", r"[ -~]{1,12}", "build.rom_title")
    game_code = manifest_header_value(manifest, "game_code", "GBS0", r"[A-Z0-9]{4}", "build.game_code")
    maker_code = manifest_header_value(manifest, "maker_code", "00", r"[A-Z0-9]{2}", "build.maker_code")
    rom_version = manifest_header_value(manifest, "rom_version", "00", r"[0-9A-F]{2}", "build.rom_version")
    project_sources = manifest_build_sources(manifest) or ["main.cpp"]
    jobs = getattr(args, "jobs", None)
    inherited_jobs = re.search(
        r"(?:^|\s)(?:--jobs(?:=|\s|$)|-?j(?:\d|\s|$)|--jobserver-(?:auth|fds)(?:=|\s|$))",
        os.environ.get("MAKEFLAGS", ""),
    )
    # Keep inherited Make scheduling unless the caller explicitly overrides it.
    # Automatic parallelism is bounded for projects with large generated headers.
    job_flags = [] if jobs is None and inherited_jobs else [
        f"-j{min(jobs if jobs is not None else min(4, os.cpu_count() or 1), len(project_sources))}"
    ]

    if not args.skip_validation:
        require_path(engine_pack, "Engine Pack")
        require_path(project_dir, "Diretorio do projeto")
        require_path(project_dir / "main.cpp", "main.cpp do projeto")
        require_path(makefile, "Makefile do Engine Pack")
        require_path(engine_lib, "Biblioteca da engine")

    display_command = [
        args.make,
        *job_flags,
        "-f",
        makefile.as_posix(),
        f"PROJECT_DIR={project_dir.as_posix()}",
        f"ENGINE_PACK={engine_pack.as_posix()}",
        f"TARGET={target}",
        f"BUILD_DIR={build_dir.as_posix()}",
        f"PROJECT_SOURCES={' '.join(project_sources)}",
        f"ROM_TITLE={rom_title}",
        f"GAME_CODE={game_code}",
        f"MAKER_CODE={maker_code}",
        f"ROM_VERSION={rom_version}",
    ]

    if args.devkitpro:
        display_command.append(f"DEVKITPRO={absolute_path(args.devkitpro).as_posix()}")
    if args.devkitarm:
        display_command.append(f"DEVKITARM={absolute_path(args.devkitarm).as_posix()}")

    display_command.append(make_target)

    make_command = [args.make, *job_flags, "-f", makefile.as_posix()]
    if args.clean:
        make_command.append("clean")
    make_command.append(make_target)

    make_env = os.environ.copy()
    make_env["PROJECT_DIR"] = project_dir.as_posix()
    make_env["ENGINE_PACK"] = engine_pack.as_posix()
    make_env["BUILD_DIR"] = build_dir.as_posix()
    make_env["TARGET"] = target
    make_env["PROJECT_SOURCES"] = " ".join(project_sources)
    make_env["ROM_TITLE"] = rom_title
    make_env["GAME_CODE"] = game_code
    make_env["MAKER_CODE"] = maker_code
    make_env["ROM_VERSION"] = rom_version
    if args.devkitpro:
        make_env["DEVKITPRO"] = absolute_path(args.devkitpro).as_posix()
    if args.devkitarm:
        make_env["DEVKITARM"] = absolute_path(args.devkitarm).as_posix()

    return make_command, make_env, display_command


def print_command(command, as_json, clean=False):
    clean_command = command[:-1] + ["clean"] if clean else None
    if as_json:
        report = {"command": command}
        if clean_command is not None:
            report["clean_command"] = clean_command
        print(json.dumps(report, indent=2))
    else:
        if clean_command is not None:
            print(" ".join(shlex.quote(part) for part in clean_command))
        print(" ".join(shlex.quote(part) for part in command))


def digest_file(file):
    try:
        return hashlib.sha256(file.read_bytes()).hexdigest()
    except FileNotFoundError:
        return None


def digest_tree(root):
    if not root.exists():
        return {}
    return {str(p.relative_to(root)): digest_file(p) for p in sorted(root.rglob("*"))
            if p.is_file() and p.relative_to(root).parts[0] not in ("build", ".gba-cache")}


def toolchain_files(env):
    devkitpro = Path(env.get("DEVKITPRO", "/opt/devkitpro"))
    devkitarm = Path(env.get("DEVKITARM", str(devkitpro / "devkitARM")))
    def executable(file):
        windows_file = file.with_name(file.name + ".exe")
        return windows_file if not file.is_file() and windows_file.is_file() else file
    compiler = executable(devkitarm / "bin/arm-none-eabi-g++")
    files = [compiler, executable(devkitarm / "bin/arm-none-eabi-objcopy"), executable(devkitpro / "tools/bin/gbafix")]
    # The driver can stay unchanged while cc1plus, binutils or libgcc change.
    for query in ("-print-prog-name=cc1plus", "-print-prog-name=as", "-print-prog-name=ld", "-print-libgcc-file-name"):
        result = subprocess.run([str(compiler), query], env=env, capture_output=True, text=True, check=True)
        candidate = Path(result.stdout.strip())
        if result.stdout.strip() and candidate.is_file():
            files.append(candidate.resolve())
    return {str(p.resolve()): digest_file(p) for p in files}


def dependencies(depfile):
    try:
        # GCC escapes spaces and uses backslash-newline for long dependency lists.
        first_rule = depfile.read_text().replace("\\\n", " ").splitlines()[0]
        return [Path(p) for p in shlex.split(first_rule.split(": ", 1)[1])]
    except (OSError, IndexError, ValueError):
        return []


def input_state(env, tools):
    pack = Path(env["ENGINE_PACK"])
    build = Path(env["BUILD_DIR"])
    project = Path(env["PROJECT_DIR"])
    lock = build.parent / ("." + build.name + ".gbsbuild-lock")
    project_files = digest_tree(project)
    # A custom build directory inside the project must never hash its own outputs.
    project_files = {k: v for k, v in project_files.items()
                     if build not in (project / k).parents and lock not in (project / k).parents}
    return {"project": project_files, "headers": digest_tree(pack / "include"),
            "library": digest_file(pack / "lib/libgbastudio_engine.a"),
            "linker": digest_file(pack / "templates/gba.ld"),
            "makefile": digest_file(pack / "templates/Makefile.gba"),
            "launcher": digest_file(Path(__file__)), "tools": tools,
            "configuration": {k: env.get(k, "") for k in (
                "TARGET", "PROJECT_SOURCES", "ROM_TITLE", "GAME_CODE", "MAKER_CODE", "ROM_VERSION",
                "CXXFLAGS", "LDFLAGS", "CPPFLAGS", "MAKEFLAGS", "DEVKITARM", "DEVKITPRO",
                "CPATH", "CPLUS_INCLUDE_PATH", "C_INCLUDE_PATH")}}


def variant_cache_root(env):
    # Outside build/: Electron copies that whole directory back from staging.
    # Bind depfiles/objects to the exact paths they were compiled against.
    identity = json.dumps([env[k] for k in ("PROJECT_DIR", "BUILD_DIR", "ENGINE_PACK")])
    return Path(env["PROJECT_DIR"]) / ".gba-cache/gbsbuild" / hashlib.sha256(identity.encode()).hexdigest()


def variant_key(inputs):
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def prune_variants(root):
    entries = sorted((p for p in root.iterdir() if p.is_dir() and not p.is_symlink()
                      and re.fullmatch(r"[a-f0-9]{64}", p.name)),
                     key=lambda p: p.stat().st_mtime_ns, reverse=True)
    used, kept = 0, 0
    for entry in entries:
        size = sum(p.stat().st_size for p in entry.iterdir() if p.is_file() and not p.is_symlink())
        if kept >= VARIANT_CACHE_ENTRIES or used + size > VARIANT_CACHE_BYTES:
            shutil.rmtree(entry)
        else:
            used += size
            kept += 1


def store_variant(env, record, artifacts):
    root = variant_cache_root(env)
    try:
        if sum(p.stat().st_size for p in artifacts) > VARIANT_CACHE_BYTES:
            return
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".pending-", dir=root) as temporary:
            pending = Path(temporary)
            for artifact in artifacts:
                shutil.copyfile(artifact, pending / artifact.name)
            if {p.name: digest_file(pending / p.name) for p in artifacts} != record["artifacts"]:
                return  # Never publish a snapshot that changed while copying.
            (pending / "record.json").write_text(json.dumps(record, sort_keys=True))
            entry = root / variant_key(record["inputs"])
            if entry.is_symlink():
                entry.unlink()
            elif entry.exists():
                shutil.rmtree(entry)
            # Directory rename exposes a complete snapshot, under the build lock.
            pending.rename(entry)
        prune_variants(root)
    except OSError as error:
        print(f"Cache de variantes indisponivel; ROM compilada preservada: {error}", file=sys.stderr)


def restore_variant(env, before, compile_config, artifacts, objects, output_names):
    entry = variant_cache_root(env) / variant_key(before)
    build = Path(env["BUILD_DIR"])
    completion = build / ".gbsbuild-success.json"
    try:
        if entry.is_symlink():
            return None
        record = json.loads((entry / "record.json").read_text())
        expected = {p.name for p in artifacts}
        if (not isinstance(record, dict) or record.get("schema") != 1
                or record.get("inputs") != before or record.get("compile_config") != compile_config
                or not isinstance(record.get("artifacts"), dict)
                or set(record["artifacts"]) != expected
                or not isinstance(record.get("dependencies"), dict)):
            return None
        if any((entry / name).is_symlink() or digest_file(entry / name) != value
               for name, value in record["artifacts"].items()):
            return None
        deps = {str(d) for obj in objects for d in dependencies(entry / obj.with_suffix(".d").name)}
        if (not deps or deps != set(record["dependencies"])
                or any(not Path(d).is_absolute() or not value or digest_file(Path(d)) != value
                       for d, value in record["dependencies"].items())):
            return None
        with tempfile.TemporaryDirectory(prefix=".restore-", dir=entry.parent) as temporary:
            pending = Path(temporary)
            for artifact in artifacts:
                shutil.copyfile(entry / artifact.name, pending / artifact.name)
            if {p.name: digest_file(pending / p.name) for p in artifacts} != record["artifacts"]:
                return None
            build.mkdir(parents=True, exist_ok=True)
            completion.unlink(missing_ok=True)
            for name in output_names:
                (build / name).unlink(missing_ok=True)
            (build / ".gbs-compile-config").write_bytes(json.dumps(compile_config, sort_keys=True).encode())
            for artifact in artifacts:
                (pending / artifact.name).replace(artifact)
            # Restored inputs can have newer mtimes despite identical bytes.
            # Keep Make from rebuilding unrelated restored objects on the next edit.
            for obj in objects:
                os.utime(obj, None)
            if (input_state(env, toolchain_files(env)) != before
                    or any(digest_file(Path(d)) != value for d, value in record["dependencies"].items())):
                (build / output_names[1]).unlink(missing_ok=True)
                print("Entradas mudaram durante a restauracao; ROM descartada. Execute novamente.", file=sys.stderr)
                return 1
            pending_record = completion.with_suffix(".tmp")
            pending_record.write_text(json.dumps(record, sort_keys=True))
            pending_record.replace(completion)
        os.utime(entry, None)
        print(f"ROM reutilizada (variante, conteudo e dependencias verificados): {build / output_names[1]}")
        return 0
    except (OSError, ValueError, TypeError):
        # A partial restore is never a success; the ordinary build validates
        # objects again and removes old ROM outputs before invoking Make.
        return None


def incremental_build(command, env, clean, cache_enabled=True):
    build = Path(env["BUILD_DIR"])
    build.parent.mkdir(parents=True, exist_ok=True)
    lock = build.parent / ("." + build.name + ".gbsbuild-lock")
    try:
        lock.mkdir()
    except FileExistsError:
        try:
            pid = int((lock / "pid").read_text())
            if pid <= 0:
                raise ValueError("invalid owner")
            os.kill(pid, 0)
        except ProcessLookupError:
            (lock / "pid").unlink()
            lock.rmdir()
            lock.mkdir()
        except (OSError, ValueError):
            raise SystemExit(f"Lock sem dono verificavel: {lock}. Verifique o processo antes de remover.")
        else:
            raise SystemExit(f"Build ja esta em uso: {build}. Tente novamente ao terminar.")
    (lock / "pid").write_text(str(os.getpid()))
    try:
        return locked_build(command, env, build, clean or not cache_enabled, cache_enabled)
    finally:
        (lock / "pid").unlink()
        lock.rmdir()


def locked_build(command, env, build, clean, cache_enabled):
    completion = build / ".gbsbuild-success.json"
    try:
        previous = json.loads(completion.read_text())
    except (OSError, ValueError):
        previous = {}
    if (not isinstance(previous, dict) or previous.get("schema") != 1
            or not isinstance(previous.get("artifacts"), dict)
            or not isinstance(previous.get("dependencies"), dict)):
        previous = {}
    tools = toolchain_files(env)
    before = input_state(env, tools)
    sources = env["PROJECT_SOURCES"].split()
    objects = [build / Path(s).with_suffix(".o") for s in sources]
    output_names = [env["TARGET"] + suffix for suffix in (".elf", ".gba", ".map")]
    artifacts = [*objects, *(p.with_suffix(".d") for p in objects), *(build / n for n in output_names)]
    artifact_hashes = {p.name: digest_file(p) for p in artifacts}
    dependency_hashes = {str(d): digest_file(d) for p in objects for d in dependencies(p.with_suffix(".d"))}
    if (not clean and command[-1] == "all" and previous.get("schema") == 1
            and previous.get("inputs") == before and previous.get("artifacts") == artifact_hashes
            and previous.get("dependencies") == dependency_hashes
            and all(artifact_hashes.values()) and all(dependency_hashes.values())):
        print(f"ROM reutilizada (conteudo e dependencias verificados): {build / output_names[1]}")
        return 0

    compile_config = {"tools": tools, "makefile": before["makefile"], "launcher": before["launcher"],
                      "headers_environment": {k: env.get(k, "") for k in (
                          "CXXFLAGS", "CPPFLAGS", "CPATH", "CPLUS_INCLUDE_PATH", "C_INCLUDE_PATH")}}
    if (cache_enabled and not clean and command[-1] == "all"
            and previous.get("inputs") and previous["inputs"] != before):
        restored = restore_variant(env, before, compile_config, artifacts, objects, output_names)
        if restored is not None:
            return restored
    completion.unlink(missing_ok=True)
    config_bytes = json.dumps(compile_config, sort_keys=True).encode()
    previous_config = previous.get("compile_config")
    for obj in objects:
        deps = dependencies(obj.with_suffix(".d"))
        if (clean or previous_config != compile_config or not deps
                or previous.get("artifacts", {}).get(obj.name) != digest_file(obj)
                or previous.get("artifacts", {}).get(obj.with_suffix(".d").name) != digest_file(obj.with_suffix(".d"))
                or any(previous.get("dependencies", {}).get(str(d)) != digest_file(d) for d in deps)):
            obj.unlink(missing_ok=True)
    # Every miss relinks cheaply. A failed build must not expose the old ROM.
    for name in output_names:
        (build / name).unlink(missing_ok=True)
    if clean:
        clean_command = [part for part in command[:-1] if part != "clean"] + ["clean"]
        clean_result = subprocess.run(clean_command, env=env, check=False)
        if clean_result.returncode:
            return clean_result.returncode
        command = [part for part in command if part != "clean"]
    build.mkdir(parents=True, exist_ok=True)
    stamp = build / ".gbs-compile-config"
    if not stamp.exists() or stamp.read_bytes() != config_bytes:
        stamp.write_bytes(config_bytes)
    env["GBS_COMPILE_CONFIG"] = stamp.as_posix().replace(" ", "\\ ")
    result = subprocess.run(command, env=env, check=False)
    if result.returncode:
        return result.returncode
    after = input_state(env, toolchain_files(env))
    if before != after:
        (build / output_names[1]).unlink(missing_ok=True)
        print("Entradas mudaram durante o build; ROM descartada. Execute novamente.", file=sys.stderr)
        return 1
    if command[-1] == "all":
        artifacts_after = {p.name: digest_file(p) for p in artifacts}
        deps_after = {str(d): digest_file(d) for p in objects for d in dependencies(p.with_suffix(".d"))}
        if not all(artifacts_after.values()) or not all(deps_after.values()):
            print("Build incompleto; nao foi gravado cache de ROM.", file=sys.stderr)
            return 1
        if cache_enabled:
            record = {"schema": 1, "inputs": after, "compile_config": compile_config,
                      "artifacts": artifacts_after, "dependencies": deps_after}
            pending = completion.with_suffix(".tmp")
            pending.write_text(json.dumps(record, sort_keys=True))
            pending.replace(completion)
            store_variant(env, record, artifacts)
    return 0


def main():
    parser = argparse.ArgumentParser(description="GBAStudio Engine Pack build launcher")
    parser.add_argument("--engine-pack", required=False, default=os.environ.get("GBS_ENGINE_PACK"))
    parser.add_argument("--project-dir", required=False, default=os.environ.get("GBS_PROJECT_DIR"))
    parser.add_argument("--target", default=None)
    parser.add_argument("--build-dir", default=os.environ.get("GBS_BUILD_DIR"))
    parser.add_argument("--devkitpro", default=os.environ.get("DEVKITPRO"))
    parser.add_argument("--devkitarm", default=os.environ.get("DEVKITARM"))
    parser.add_argument("--make", default=os.environ.get("MAKE", "make"))
    parser.add_argument("--make-target", default=None)
    parser.add_argument("--jobs", type=positive_jobs, default=os.environ.get("GBS_BUILD_JOBS"),
                        help="Maximo de compilacoes simultaneas; padrao automatico limitado a 4")
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--skip-validation", action="store_true")
    parser.add_argument("--version", action="store_true")
    args = parser.parse_args()

    if args.version:
        print(VERSION)
        return 0

    if not args.engine_pack:
        parser.error("--engine-pack ou GBS_ENGINE_PACK e obrigatorio")
    if not args.project_dir:
        parser.error("--project-dir ou GBS_PROJECT_DIR e obrigatorio")

    make_command, make_env, display_command = build_make_invocation(args)
    if args.dry_run:
        print_command(display_command, args.json, args.clean)
        return 0

    manifest = load_project_manifest(Path(make_env["PROJECT_DIR"]))
    build_config = manifest.get("build", {})
    cache_enabled = not isinstance(build_config, dict) or build_config.get("incremental_cache") is not False
    return incremental_build(make_command, make_env, args.clean, cache_enabled)


if __name__ == "__main__":
    sys.exit(main())
