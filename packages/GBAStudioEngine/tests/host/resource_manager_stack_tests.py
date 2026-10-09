#!/usr/bin/env python3

import os
import pathlib
import subprocess
import tempfile


ROOT = pathlib.Path(__file__).resolve().parents[2]
MAX_TRANSACTION_STACK_BYTES = 1024
TARGET_FUNCTIONS = (
    "gbs::enqueue_resource_bank_upload_sources_vblank(",
    "gbs::reserve_resource_banks(",
    "gbs::release_resource_banks(",
    "gbs::hot_swap_resource_banks(",
    "gbs::reserve_resource_bank_cached(",
    "gbs::restore_resource_manager_snapshot(",
)


def main() -> None:
    devkitarm = pathlib.Path(os.environ.get("DEVKITARM", "/opt/devkitpro/devkitARM"))
    compiler = devkitarm / "bin" / "arm-none-eabi-g++"
    if not compiler.is_file():
        raise SystemExit(f"devkitARM nao encontrado em {devkitarm}")

    with tempfile.TemporaryDirectory(prefix="gbs-resource-stack-") as temp_dir:
        output = pathlib.Path(temp_dir) / "gbs_resource_manager.o"
        subprocess.run(
            [
                str(compiler),
                "-mthumb",
                "-mthumb-interwork",
                "-mcpu=arm7tdmi",
                "-mtune=arm7tdmi",
                "-Os",
                "-ffreestanding",
                "-fdata-sections",
                "-ffunction-sections",
                "-Wall",
                "-Wextra",
                f"-I{ROOT / 'engine' / 'include'}",
                f"-I{ROOT / 'engine' / 'src'}",
                "-std=c++17",
                "-fno-exceptions",
                "-fno-rtti",
                "-fno-threadsafe-statics",
                "-fstack-usage",
                "-c",
                str(ROOT / "engine" / "src" / "gbs_resource_manager.cpp"),
                "-o",
                str(output),
            ],
            check=True,
        )

        usage_path = output.with_suffix(".su")
        entries = usage_path.read_text(encoding="utf-8").splitlines()
        measured: dict[str, int] = {}
        for line in entries:
            fields = line.split("\t")
            if len(fields) < 2:
                continue
            signature = fields[0]
            for target in TARGET_FUNCTIONS:
                if target in signature:
                    measured[target] = int(fields[1])

        missing = [target for target in TARGET_FUNCTIONS if target not in measured]
        if missing:
            raise AssertionError(f"funcoes sem medicao de stack: {', '.join(missing)}")

        oversized = {
            target: size
            for target, size in measured.items()
            if size > MAX_TRANSACTION_STACK_BYTES
        }
        if oversized:
            details = ", ".join(f"{target} {size} bytes" for target, size in oversized.items())
            raise AssertionError(
                f"transacoes de resource bank excedem {MAX_TRANSACTION_STACK_BYTES} bytes: {details}"
            )

        print(
            "resource manager ARM stack ok: "
            + ", ".join(f"{target} {measured[target]} bytes" for target in TARGET_FUNCTIONS)
        )


if __name__ == "__main__":
    main()
