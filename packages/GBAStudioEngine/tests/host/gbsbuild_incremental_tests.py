"""Real Make graph with tiny fake tools: no devkitARM installation is needed."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PureWindowsPath
import shutil
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools/gbsbuild/gbsbuild.py"
FAKE = r'''#!/usr/bin/env python3
import hashlib,json,os,re,sys,time
from pathlib import Path
args=sys.argv[1:]
name=Path(sys.argv[0]).name
if '--version' in args:
 print('fake-toolchain-v1');sys.exit(0)
if any(arg.startswith('-print-') for arg in args):
 if os.environ.get('FAKE_QUERY_COUNTER'):
  counter=Path(os.environ['FAKE_QUERY_COUNTER'])
  count=int(counter.read_text())+1 if counter.exists() else 1
  counter.write_text(str(count))
  if count==int(os.environ.get('FAKE_MUTATE_ON_QUERY','0')):
   Path(os.environ['FAKE_MUTATION_PATH']).write_text('changed-during-restore')
 print('');sys.exit(0)
with open(os.environ['FAKE_BUILD_LOG'],'a') as log:
 log.write(json.dumps({'tool':name,'args':args})+'\n')
if name=='arm-none-eabi-g++':
 out=Path(args[args.index('-o')+1]);out.parent.mkdir(parents=True,exist_ok=True)
 if '-c' in args:
  source=Path(args[args.index('-c')+1]);deps=[source]
  def span(event):
   if os.environ.get('FAKE_SPANS_LOG'):
    with open(os.environ['FAKE_SPANS_LOG'],'a') as f:
     f.write(json.dumps({'event':event,'source':source.name,'time':time.monotonic_ns()})+'\n')
  span('start');time.sleep(float(os.environ.get('FAKE_COMPILE_DELAY','0')))
  if source.name==os.environ.get('FAKE_FAIL_SOURCE'):
   span('end');sys.exit(1)
  for header in re.findall(r'#include "([^"]+)"',source.read_text()):
   deps.append(source.parent/header)
  out.write_bytes(hashlib.sha256(b''.join(p.read_bytes() for p in deps)).digest())
  if '-MD' in args or '-MMD' in args:
   dep=Path(args[args.index('-MF')+1]) if '-MF' in args else out.with_suffix('.d')
   dep.write_text(str(out)+': '+' '.join(str(p).replace(' ','\\ ') for p in deps)+'\n')
  span('end')
 else:
  out.write_bytes(hashlib.sha256(b''.join(Path(a).read_bytes() for a in args if a.endswith(('.o','.a')))).digest())
  for arg in args:
   if arg.startswith('-Wl,-Map,'):Path(arg[len('-Wl,-Map,'):]).write_text('map')
elif name=='arm-none-eabi-objcopy':
 Path(args[-1]).write_bytes(Path(args[-2]).read_bytes())
else:
 rom=Path(args[0]);rom.write_bytes(rom.read_bytes()+('|'.join(args[1:])).encode())
'''

class IncrementalBuildTests(unittest.TestCase):
    def test_bundled_shell_with_spaces_is_used_for_make_recipes(self):
        shell = self.root / "GBA Studio shell"
        marker = self.root / "shell-invoked"
        shell.write_text('#!/bin/sh\n: > "' + str(marker) + '"\nexec /bin/bash "$@"\n')
        shell.chmod(0o755)
        self.env["GBS_SHELL"] = str(shell)
        self.run_build()
        self.assertTrue(marker.exists(), "Make must use the bundled shell")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gba-incremental-make-")
        self.root = Path(self.temp.name)
        self.pack, self.project = self.root/"pack", self.root/"project"
        (self.pack/"templates").mkdir(parents=True)
        (self.pack/"templates/Makefile.gba").write_bytes((ROOT/"templates/Makefile.gba").read_bytes())
        (self.pack/"templates/gba.ld").write_text("linker")
        (self.pack/"lib").mkdir()
        (self.pack/"lib/libgbastudio_engine.a").write_bytes(b"library")
        self.project.mkdir()
        for name in ["main","npc"]:
            (self.project/(name+".cpp")).write_text('#include "'+name+'.hpp"\n#include "shared.hpp"\n')
            (self.project/(name+".hpp")).write_text("data-"+name)
        (self.project/"shared.hpp").write_text("shared")
        self.manifest={"build":{"target":"game","sources":["main.cpp","npc.cpp"]}}
        self.save()
        self.devkit=self.root/"devkit"
        for folder,names in [("devkitARM/bin",["arm-none-eabi-g++","arm-none-eabi-objcopy"]),("tools/bin",["gbafix"])]:
            d=self.devkit/folder;d.mkdir(parents=True)
            for name in names:
                p=d/name;p.write_text(FAKE);p.chmod(0o755)
        self.log=self.root/"calls.jsonl"
        self.env={**os.environ,"FAKE_BUILD_LOG":str(self.log)}
    def tearDown(self):
        self.temp.cleanup()
    def save(self):
        (self.project/"gbastudio_project.json").write_text(json.dumps(self.manifest))
    def run_build(self, *args, success=True):
        self.log.write_text("")
        result=subprocess.run([sys.executable,str(TOOL),"--engine-pack",str(self.pack),
            "--project-dir",str(self.project),"--devkitpro",str(self.devkit),
            "--devkitarm",str(self.devkit/"devkitARM"),*args],
            env=self.env,capture_output=True,text=True)
        if success:self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        else:self.assertNotEqual(result.returncode,0)
        calls=[json.loads(x) for x in self.log.read_text().splitlines()]
        return [c for c in calls if "-c" in c["args"]]
    def change_same_mtime(self, file, contents):
        old=file.stat();file.write_text(contents);os.utime(file,ns=(old.st_atime_ns,old.st_mtime_ns))
    def test_identical_play_runs_no_compiler_and_matches_clean_rom(self):
        self.assertEqual(len(self.run_build()),2)
        rom=self.project/"build/game.gba";sha=hashlib.sha256(rom.read_bytes()).hexdigest()
        self.assertEqual(len(self.run_build()),0)
        self.assertEqual(self.log.read_text(), "", "Warm ROM must skip linking and gbafix too")
        self.run_build("--clean")
        self.assertEqual(hashlib.sha256(rom.read_bytes()).hexdigest(),sha)
    def test_paths_with_spaces_use_the_same_incremental_graph(self):
        spaced = self.root/"project with spaces"
        self.project.rename(spaced); self.project = spaced
        self.assertEqual(len(self.run_build()),2)
        self.assertEqual(len(self.run_build()),0)
    def test_disabled_cache_rebuilds_every_time_and_does_not_record_a_rom_hit(self):
        self.manifest["build"]["incremental_cache"] = False
        self.save()
        self.assertEqual(len(self.run_build()),2)
        self.assertEqual(len(self.run_build()),2)
        self.assertFalse((self.project/"build/.gbsbuild-success.json").exists())
    def test_local_header_with_preserved_mtime_rebuilds_only_its_consumer(self):
        self.run_build()
        self.change_same_mtime(self.project/"npc.hpp","new-npc")
        calls=self.run_build()
        self.assertEqual(len(calls),1)
        self.assertIn(str((self.project/"npc.cpp").resolve()),calls[0]["args"])
    def test_shared_header_rebuilds_both_consumers(self):
        self.run_build();self.change_same_mtime(self.project/"shared.hpp","new-shared")
        self.assertEqual(len(self.run_build()),2)
    def test_library_linker_and_rom_header_changes_keep_objects_but_update_rom(self):
        self.run_build();rom=self.project/"build/game.gba";old=rom.read_bytes()
        self.change_same_mtime(self.pack/"lib/libgbastudio_engine.a","library-v2")
        self.assertEqual(len(self.run_build()),0);self.assertNotEqual(rom.read_bytes(),old)
        self.change_same_mtime(self.pack/"templates/gba.ld","linker-v2")
        self.assertEqual(len(self.run_build()),0)
        self.manifest["build"]["game_code"]="NEW1";self.save()
        self.assertEqual(len(self.run_build()),0);self.assertIn(b"-cNEW1",rom.read_bytes())
    def test_corrupted_or_missing_object_is_recompiled(self):
        self.run_build()
        (self.project/"build/npc.o").write_bytes(b"corrupt")
        self.assertEqual(len(self.run_build()),1)
        (self.project/"build/main.o").unlink()
        self.assertEqual(len(self.run_build()),1)
    def test_corrupted_rom_is_recreated_without_compiling(self):
        self.run_build();rom=self.project/"build/game.gba";old=rom.read_bytes()
        rom.write_bytes(b"corrupt")
        self.assertEqual(len(self.run_build()),0);self.assertEqual(rom.read_bytes(),old)
    def test_invalid_completion_manifest_forces_a_safe_fresh_build(self):
        self.run_build()
        (self.project/"build/.gbsbuild-success.json").write_text("[]")
        self.assertEqual(len(self.run_build()),2)
    def test_toolchain_or_makefile_change_rebuilds_objects(self):
        self.run_build()
        compiler=self.devkit/"devkitARM/bin/arm-none-eabi-g++"
        compiler.write_text(FAKE+"\n# compiler revision\n")
        self.assertEqual(len(self.run_build()),2)
        makefile=self.pack/"templates/Makefile.gba"
        makefile.write_text(makefile.read_text()+"\n# compile configuration revision\n")
        self.assertEqual(len(self.run_build()),2)
    def test_windows_executable_suffixes_are_hashed_for_cache_invalidation(self):
        spec = importlib.util.spec_from_file_location("gbsbuild_tested", TOOL)
        tool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)
        expected = {}
        for relative in ("devkitARM/bin/arm-none-eabi-g++", "devkitARM/bin/arm-none-eabi-objcopy", "tools/bin/gbafix"):
            original = self.devkit/relative
            executable = original.with_name(original.name + ".exe")
            original.rename(executable)
            expected[str(executable.resolve())] = hashlib.sha256(executable.read_bytes()).hexdigest()
        env = {**self.env, "DEVKITPRO": str(self.devkit), "DEVKITARM": str(self.devkit/"devkitARM")}
        self.assertEqual(tool.toolchain_files(env), expected)
    def test_failed_build_cannot_reuse_previous_rom(self):
        self.run_build();(self.project/"shared.hpp").unlink()
        self.run_build(success=False)
        self.assertFalse((self.project/"build/game.gba").exists())

    def variant_a_then_b(self):
        self.run_build()
        rom_a = (self.project/"build/game.gba").read_bytes()
        records = list((self.project/".gba-cache/gbsbuild").glob("*/*/record.json"))
        self.assertEqual(len(records), 1)
        cached_a = records[0].parent
        self.change_same_mtime(self.project/"npc.hpp", "scene-b")
        self.assertEqual(len(self.run_build()), 1)
        return rom_a, cached_a

    def test_returning_to_verified_variant_skips_all_tools_and_restores_incremental_state(self):
        self.run_build()
        rom_a = (self.project/"build/game.gba").read_bytes()
        self.change_same_mtime(self.project/"npc.hpp", "scene-b")
        self.run_build()
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.assertEqual(len(self.run_build()), 0)
        self.assertEqual(self.log.read_text(), "", "Variant hit must skip link/objcopy/gbafix")
        self.assertEqual((self.project/"build/game.gba").read_bytes(), rom_a)
        self.assertEqual(len(self.run_build()), 0)
        self.change_same_mtime(self.project/"main.hpp", "edited-actor")
        self.assertEqual(len(self.run_build()), 1, "Restored objects must remain incremental")
        edited_rom = (self.project/"build/game.gba").read_bytes()
        self.run_build("--clean")
        self.assertEqual((self.project/"build/game.gba").read_bytes(), edited_rom)

    def test_variant_cache_handles_paths_with_spaces_and_custom_build_directory(self):
        self.project.rename(self.root/"project with spaces")
        self.project = self.root/"project with spaces"
        build = self.project/"nested/build output"
        args = ("--build-dir", str(build))
        self.run_build(*args)
        self.change_same_mtime(self.project/"npc.hpp", "scene-b")
        self.run_build(*args)
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.assertEqual(len(self.run_build(*args)), 0)
        self.assertEqual(self.log.read_text(), "")
        self.assertTrue((build/"game.gba").exists())

    def test_shared_asset_change_cannot_hit_an_older_scene_variant(self):
        self.variant_a_then_b()
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.change_same_mtime(self.project/"shared.hpp", "new-shared-asset")
        self.assertEqual(len(self.run_build()), 2)

    def test_external_header_change_rejects_variant_even_with_identical_project_inputs(self):
        external = self.root/"external.hpp"
        external.write_text("external-a")
        source = self.project/"main.cpp"
        source.write_text(source.read_text() + '#include "' + str(external) + '"\n')
        self.variant_a_then_b()
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.change_same_mtime(external, "external-b")
        self.assertEqual(len(self.run_build()), 2, "Both current objects need their changed inputs")

    def test_corrupted_variant_artifact_falls_back_to_build(self):
        for artifact in ("npc.o", "npc.d", "game.gba", "game.elf", "game.map"):
            with self.subTest(artifact=artifact):
                # Force a fresh A/B pair without importing the preceding variant.
                self.run_build("--clean")
                rom_a, cached_a = self.variant_a_then_b()
                (cached_a/artifact).write_bytes(b"corrupt")
                self.change_same_mtime(self.project/"npc.hpp", "data-npc")
                self.assertEqual(len(self.run_build()), 1)
                self.assertTrue(self.log.read_text(), "Corrupt cache must invoke build tools")
                self.assertEqual((self.project/"build/game.gba").read_bytes(), rom_a)
                # Keep the next pair's first variant deterministic.
                shutil.rmtree(self.project/".gba-cache/gbsbuild")

    def test_malformed_variant_record_cannot_publish_cached_rom(self):
        rom_a, cached_a = self.variant_a_then_b()
        (cached_a/"record.json").write_text("[]")
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.assertEqual(len(self.run_build()), 1)
        self.assertEqual((self.project/"build/game.gba").read_bytes(), rom_a)

    def test_variant_record_cannot_restore_paths_outside_build(self):
        rom_a, cached_a = self.variant_a_then_b()
        record = json.loads((cached_a/"record.json").read_text())
        record["artifacts"]["../outside.txt"] = hashlib.sha256(b"unwanted").hexdigest()
        (cached_a/"record.json").write_text(json.dumps(record))
        outside = self.project/"outside.txt"
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.assertEqual(len(self.run_build()), 1)
        self.assertFalse(outside.exists())
        self.assertEqual((self.project/"build/game.gba").read_bytes(), rom_a)

    def test_variant_cache_is_bounded_and_eviction_keeps_newer_variants(self):
        self.run_build()
        for index in range(10):
            self.change_same_mtime(self.project/"npc.hpp", "variant-" + str(index))
            self.run_build()
        records = list((self.project/".gba-cache/gbsbuild").glob("*/*/record.json"))
        self.assertEqual(len(records), 8)
        self.change_same_mtime(self.project/"npc.hpp", "variant-8")
        self.assertEqual(len(self.run_build()), 0)
        self.assertEqual(self.log.read_text(), "")
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.assertEqual(len(self.run_build()), 1, "Evicted A must be rebuilt")

    def test_disabled_cache_neither_reads_nor_writes_variants(self):
        self.run_build()
        self.manifest["build"]["incremental_cache"] = False
        self.save()
        self.assertEqual(len(self.run_build()), 2)
        self.assertEqual(len(self.run_build()), 2)
        records = list((self.project/".gba-cache/gbsbuild").glob("*/*/record.json"))
        self.assertEqual(len(records), 1, "Disabled runs must not add variants")

    def test_toolchain_and_library_changes_invalidate_cached_variant(self):
        for kind in ("library", "compiler"):
            with self.subTest(kind=kind):
                self.run_build("--clean")
                self.change_same_mtime(self.project/"npc.hpp", "data-npc")
                self.run_build()
                self.change_same_mtime(self.project/"npc.hpp", "scene-b")
                self.run_build()
                self.change_same_mtime(self.project/"npc.hpp", "data-npc")
                if kind == "library":
                    self.change_same_mtime(self.pack/"lib/libgbastudio_engine.a", "new-library")
                    self.assertEqual(len(self.run_build()), 1)
                else:
                    compiler = self.devkit/"devkitARM/bin/arm-none-eabi-g++"
                    compiler.write_text(FAKE + "\n# new compiler\n")
                    self.assertEqual(len(self.run_build()), 2)
                self.assertTrue(self.log.read_text())

    def test_launcher_change_invalidates_variant_and_rebuilds_objects(self):
        local_tool = self.root/"gbsbuild.py"
        shutil.copyfile(TOOL, local_tool)
        with patch.object(sys.modules[__name__], "TOOL", local_tool):
            self.variant_a_then_b()
            self.change_same_mtime(self.project/"npc.hpp", "data-npc")
            local_tool.write_text(local_tool.read_text() + "\n# launcher revision\n")
            self.assertEqual(len(self.run_build()), 2)

    def test_unavailable_variant_storage_does_not_fail_successful_build(self):
        (self.project/".gba-cache").mkdir()
        (self.project/".gba-cache/gbsbuild").write_text("storage unavailable")
        self.assertEqual(len(self.run_build()), 2)
        self.assertTrue((self.project/"build/game.gba").exists())
        self.assertEqual(len(self.run_build()), 0)

    def test_variant_restore_rejects_inputs_changed_during_restore(self):
        self.variant_a_then_b()
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        self.env.update(FAKE_QUERY_COUNTER=str(self.root/"query-count"),
                        FAKE_MUTATE_ON_QUERY="5", FAKE_MUTATION_PATH=str(self.project/"shared.hpp"))
        self.run_build(success=False)
        self.assertFalse((self.project/"build/game.gba").exists())
        self.assertFalse((self.project/"build/.gbsbuild-success.json").exists())

    def test_live_build_lock_blocks_variant_reads_and_writes(self):
        _, cached_a = self.variant_a_then_b()
        self.change_same_mtime(self.project/"npc.hpp", "data-npc")
        before = (cached_a/"record.json").read_bytes()
        lock = self.project/".build.gbsbuild-lock"
        lock.mkdir(); (lock/"pid").write_text(str(os.getpid()))
        self.run_build(success=False)
        self.assertEqual((cached_a/"record.json").read_bytes(), before)
        self.assertEqual(self.log.read_text(), "")

    def test_variant_byte_budget_retains_older_entries_that_still_fit(self):
        spec = importlib.util.spec_from_file_location("gbsbuild_tested", TOOL)
        tool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)
        root = self.root/"budget";root.mkdir()
        older = root/("1" * 64); newer = root/("2" * 64)
        older.mkdir();newer.mkdir()
        (older/"artifact").write_bytes(b"small")
        (newer/"artifact").write_bytes(b"too-large-for-budget")
        os.utime(older, ns=(1, 1));os.utime(newer, ns=(2, 2))
        with patch.object(tool, "VARIANT_CACHE_BYTES", 6):
            tool.prune_variants(root)
        self.assertFalse(newer.exists())
        self.assertTrue(older.exists(), "Oversized rejected entry must not consume the byte budget")

    def invocation(self, **overrides):
        spec = importlib.util.spec_from_file_location("gbsbuild_parallel_tested", TOOL)
        tool = importlib.util.module_from_spec(spec); spec.loader.exec_module(tool)
        args = SimpleNamespace(engine_pack=str(self.pack), project_dir=str(self.project),
            build_dir=None, target=None, make_target=None, skip_validation=False,
            make="make", devkitpro=str(self.devkit), devkitarm=str(self.devkit/"devkitARM"),
            clean=False, jobs=None)
        args.__dict__.update(overrides)
        return tool, args

    def test_native_windows_paths_reach_make_with_forward_slashes(self):
        tool, args = self.invocation(engine_pack=r"C:\GBA Studio\pack",
            project_dir=r"C:\Games\My Game", build_dir=r"C:\Games\My Game\build",
            devkitpro=r"C:\devkitPro", devkitarm=r"C:\devkitPro\devkitARM", skip_validation=True)
        with patch.object(tool, "absolute_path", side_effect=PureWindowsPath), \
                patch.object(tool, "load_project_manifest", return_value={}):
            command, env, display = tool.build_make_invocation(args)
        self.assertEqual(env["PROJECT_DIR"], "C:/Games/My Game")
        self.assertEqual(env["ENGINE_PACK"], "C:/GBA Studio/pack")
        self.assertEqual(env["BUILD_DIR"], "C:/Games/My Game/build")
        self.assertEqual(env["DEVKITPRO"], "C:/devkitPro")
        self.assertEqual(env["DEVKITARM"], "C:/devkitPro/devkitARM")
        self.assertIn("C:/GBA Studio/pack/templates/Makefile.gba", command)
        self.assertIn("PROJECT_DIR=C:/Games/My Game", display)

    def test_default_jobs_are_bounded_by_cpu_sources_and_four(self):
        tool, args = self.invocation()
        with patch.dict(os.environ, {"MAKEFLAGS":""}), patch.object(tool.os, "cpu_count", return_value=64):
            self.assertIn("-j2", tool.build_make_invocation(args)[0])
            self.manifest["build"]["sources"] += ["third.cpp", "fourth.cpp", "fifth.cpp"]
            self.save()
            self.assertIn("-j4", tool.build_make_invocation(args)[0])
        for cpus in (1, None):
            with patch.dict(os.environ, {"MAKEFLAGS":""}), patch.object(tool.os, "cpu_count", return_value=cpus):
                self.assertIn("-j1", tool.build_make_invocation(args)[0])

    def test_explicit_jobs_override_inherited_make_parallelism(self):
        tool, args = self.invocation(jobs=1)
        with patch.dict(os.environ, {"MAKEFLAGS":" -j2 --jobserver-auth=3,4"}):
            self.assertIn("-j1", tool.build_make_invocation(args)[0])
        args.jobs=64
        self.assertIn("-j2", tool.build_make_invocation(args)[0], "Cannot run more compilers than sources")

    def test_default_respects_inherited_make_jobs(self):
        tool, args = self.invocation()
        for flags in ("-j2", " -j --jobserver-fds=3,4", "--jobs=3", "k -j 2"):
            with patch.dict(os.environ, {"MAKEFLAGS":flags}):
                command = tool.build_make_invocation(args)[0]
                self.assertFalse(any(part.startswith("-j") for part in command), command)

    def test_invalid_jobs_fail_before_running_build_tools(self):
        for value in ("0", "-1", "invalid"):
            with self.subTest(value=value):
                self.run_build("--jobs", value, success=False)
                self.assertEqual(self.log.read_text(), "")
        self.env["GBS_BUILD_JOBS"]="0"
        self.run_build(success=False)
        self.assertEqual(self.log.read_text(), "")

    def test_environment_jobs_and_dry_run_show_actual_parallel_limit(self):
        self.env["GBS_BUILD_JOBS"]="1"
        result=subprocess.run([sys.executable, str(TOOL), "--engine-pack", str(self.pack),
            "--project-dir",str(self.project),"--dry-run","--json"],env=self.env,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("-j1",json.loads(result.stdout)["command"])
        self.assertFalse(self.log.exists())

    def test_parallel_clean_dry_run_separates_cleanup_from_build(self):
        result=subprocess.run([sys.executable,str(TOOL),"--engine-pack",str(self.pack),
            "--project-dir",str(self.project),"--clean","--jobs","2","--dry-run","--json"],
            env=self.env,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        report=json.loads(result.stdout)
        self.assertEqual(report["clean_command"][-1],"clean")
        self.assertNotIn("all",report["clean_command"])
        self.assertEqual(report["command"][-1],"all")
        self.assertNotIn("clean",report["command"])

    def test_parallel_compilers_overlap_and_jobs_changes_keep_warm_rom(self):
        spans=self.root/"spans.jsonl"
        self.env.update(FAKE_SPANS_LOG=str(spans),FAKE_COMPILE_DELAY="0.3")
        self.run_build("--jobs","2")
        rows=sorted((json.loads(line) for line in spans.read_text().splitlines()),key=lambda row:row["time"])
        active=peak=0
        for row in rows:
            active += 1 if row["event"]=="start" else -1
            peak=max(peak,active)
        self.assertEqual(peak,2);self.assertEqual(active,0)
        parallel_rom=(self.project/"build/game.gba").read_bytes()
        self.assertEqual(self.run_build("--jobs","1"),[])
        self.run_build("--clean","--jobs","1")
        self.assertEqual((self.project/"build/game.gba").read_bytes(),parallel_rom)
        self.run_build("--clean","--jobs","2")
        self.assertEqual((self.project/"build/game.gba").read_bytes(),parallel_rom)

    def test_parallel_failure_waits_for_compilers_and_keeps_rom_invalid(self):
        spans=self.root/"spans.jsonl"
        self.run_build()
        self.change_same_mtime(self.project/"shared.hpp","modified")
        self.env.update(FAKE_SPANS_LOG=str(spans),FAKE_COMPILE_DELAY="0.2",FAKE_FAIL_SOURCE="npc.cpp")
        self.run_build("--jobs","2",success=False)
        rows=[json.loads(line) for line in spans.read_text().splitlines()]
        self.assertEqual(sorted(r["source"] for r in rows if r["event"]=="start"),["main.cpp","npc.cpp"])
        self.assertEqual(sorted(r["source"] for r in rows if r["event"]=="end"),["main.cpp","npc.cpp"])
        self.assertFalse((self.project/"build/game.gba").exists())
        self.assertFalse((self.project/"build/.gbsbuild-success.json").exists())
        self.assertFalse((self.project/".build.gbsbuild-lock").exists())
        del self.env["FAKE_FAIL_SOURCE"]
        self.assertTrue(self.run_build("--jobs","2"))

if __name__=="__main__":
    unittest.main()
