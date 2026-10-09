#!/usr/bin/env python3
import sys, os, time, json, subprocess, runpy
from pathlib import Path
root=Path(os.environ['GBA_BENCHMARK_ROOT'])
name=Path(sys.argv[0]).name
log=os.environ['GBA_DIAG_TIMING_LOG']
def record(stage,start,**extra):
    finished=time.perf_counter()
    duration=(finished-start)*1000
    # Python 3.9 on macOS gives each process a different perf_counter origin.
    # POSIX CLOCK_MONOTONIC supplies a common origin for overlapping compilers.
    posix_clock=hasattr(time,'clock_gettime') and hasattr(time,'CLOCK_MONOTONIC')
    span_finished=(time.clock_gettime(time.CLOCK_MONOTONIC) if posix_clock else time.time())*1000
    with open(log,'a') as f: f.write(json.dumps({'stage':stage,'ms':duration,
        'startedMs':span_finished-duration,'finishedMs':span_finished,
        'clock':'posix-monotonic' if posix_clock else 'unix-time',**extra})+'\n')
if name=='assetc-timer':
    start=time.perf_counter();module=runpy.run_path(str(root/'engine-pack/tools/assetc'),run_name='diag_assetc');g=module['main'].__globals__
    for fn in list(g):
        if fn in ('emit_pack_report','emit_asset_header_from_pack_entry','shared_dialogue_ui_assets_from_project','copy_project_template_files','pack_global_bg_palette_key','pack_global_obj_palette_key','pack_background_reference_asset_id','pack_export_plan','pack_asset_source_fingerprint','pack_asset_resources','pack_physical_budget_report') or (fn.startswith('emit_') and fn.endswith('_data_header')):
            original=g[fn]
            def timed(*a,_fn=fn,_original=original,**kw):
                begin=time.perf_counter()
                try:return _original(*a,**kw)
                finally:record('assetc:'+_fn,begin)
            g[fn]=timed
    try: g['main']()
    finally: record('assetc',start)
else:
    real={'arm-none-eabi-g++':str(Path(os.environ['GBA_BENCHMARK_DEVKITARM'])/'bin/arm-none-eabi-g++'),'arm-none-eabi-objcopy':str(Path(os.environ['GBA_BENCHMARK_DEVKITARM'])/'bin/arm-none-eabi-objcopy'),'gbafix':str(Path(os.environ['GBA_BENCHMARK_DEVKITPRO'])/'tools/bin/gbafix')}[name]
    if '--version' in sys.argv or any(a.startswith('-print-') for a in sys.argv[1:]):
        sys.exit(subprocess.run([real,*sys.argv[1:]]).returncode)
    stage=('cpp' if '-c' in sys.argv else 'link') if name=='arm-none-eabi-g++' else name
    start=time.perf_counter();result=subprocess.run([real,*sys.argv[1:]])
    record(stage,start,args=sys.argv[1:],exitCode=result.returncode)
    sys.exit(result.returncode)
