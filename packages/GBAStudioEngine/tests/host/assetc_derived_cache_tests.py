"""Derived caches must avoid repeated work and preserve current source bytes."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib


def load_assetc():
    source = Path(__file__).resolve().parents[2] / 'tools/assetc/assetc.py'
    spec = importlib.util.spec_from_file_location('assetc_derived_cache_test', source)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def png(path, color=(248, 0, 0), width=16, height=16):
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    rows = b''.join(b'\0' + b''.join(bytes((*((0, 248, 0) if (x+y)%3==0 else color), 255)) for x in range(width)) for y in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 0)) + chunk(b'IEND', b''))


class DerivedCacheTests(unittest.TestCase):
    def setUp(self):
        self.assetc=load_assetc(); self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name); self.image=self.root/'sprite.png'; png(self.image)
        self.assets=[{'id':'background','name':'background','kind':'bg','png':'sprite.png','bank_group':'scene'},
                     {'id':'hero','name':'hero','kind':'obj','png':'sprite.png','sprite_width':16,'sprite_height':16,'bank_group':'scene'}]

    def report(self, assets=None, previous=None):
        with contextlib.redirect_stderr(io.StringIO()):
            result=self.assetc.emit_pack_report({'assets':assets or self.assets},self.root,previous)
        self.assertTrue(result['ok'],result['errors']); return result

    def lookup_report(self, **changes):
        header={'id':'hero','symbol':'hero','inputs':['sprite.png'],'assetc_args':['--sprite-width','16','--sprite-height','16','--destination-tile','8','--palette-bank','3']}
        header.update(changes); return {'export_plan':{'headers':[header]}}

    def replace_image(self):
        stat=self.image.stat(); old_size=stat.st_size; png(self.image,(0,0,248)); os.utime(self.image,ns=(stat.st_atime_ns,stat.st_mtime_ns))
        self.assertEqual(self.image.stat().st_size,old_size); self.assertEqual(self.image.stat().st_mtime_ns,stat.st_mtime_ns)

    def test_palette_report_reuses_both_keys_without_decoding_unchanged_png(self):
        first=self.report(); saved=json.loads(json.dumps(first))
        with patch.object(self.assetc,'pack_global_bg_palette_key',side_effect=AssertionError('BG recalculated')),patch.object(self.assetc,'pack_global_obj_palette_key',side_effect=AssertionError('OBJ recalculated')):
            second=self.report(previous=saved)
        self.assertEqual(first['usage'],second['usage'])
        self.assertEqual([a['allocations'] for a in first['allocations']],[a['allocations'] for a in second['allocations']])

    def test_png_content_change_with_same_size_and_mtime_is_visible(self):
        before=self.assetc.read_png(self.image); self.replace_image(); after=self.assetc.read_png(self.image)
        self.assertNotEqual(before[2],after[2]); self.assertIn((0,0,248),after[2])

    def test_palette_cache_invalidates_png_bytes_with_preserved_mtime(self):
        first=self.report(); self.replace_image()
        with patch.object(self.assetc,'pack_global_bg_palette_key',wraps=self.assetc.pack_global_bg_palette_key) as bg:
            after=self.report(previous=first)
        self.assertGreater(bg.call_count,0)
        self.assertIn(31744,after['allocations'][0]['palette_cache']['bg'])
        self.assertNotEqual(first['allocations'][0]['palette_cache'],after['allocations'][0]['palette_cache'])

    def test_object_palette_options_change_the_cached_key(self):
        assets=copy.deepcopy(self.assets); assets[1]['object_palette_values']=[0,31,992]
        first=self.report(assets); assets[1]['object_palette_values']=[0,31744,992]
        after=self.report(assets,first)
        self.assertEqual(after['allocations'][1]['palette_cache']['obj'][:3],[0,31744,992])

    def test_reference_bytes_invalidate_palette_and_resource_analysis(self):
        reference=self.root/'reference.png'; png(reference); assets=copy.deepcopy(self.assets); assets[0]['background_palette_reference']='reference.png'
        first=self.report(assets); stat=reference.stat(); png(reference,(0,0,248)); os.utime(reference,ns=(stat.st_atime_ns,stat.st_mtime_ns))
        with patch.object(self.assetc,'pack_global_bg_palette_key',wraps=self.assetc.pack_global_bg_palette_key) as bg:
            after=self.report(assets,first)
        self.assertGreater(bg.call_count,0)
        self.assertEqual(after['allocations'][0]['resource_cache'],'computed')

    def test_missing_or_corrupt_palette_cache_recomputes_instead_of_trusting_values(self):
        first=self.report()
        for broken in (None,[],{'signature':'bogus','obj':None,'bg':[31]},'invalid'):
            previous=copy.deepcopy(first); previous['allocations'][0]['palette_cache']=broken
            with patch.object(self.assetc,'pack_global_bg_palette_key',wraps=self.assetc.pack_global_bg_palette_key) as bg:
                second=self.report(previous=previous)
            self.assertGreater(bg.call_count,0)
            self.assertEqual(second['allocations'][0]['palette_cache']['bg'],first['allocations'][0]['palette_cache']['bg'])

    def test_tampered_values_are_rejected_even_with_matching_input_signature(self):
        first=self.report(); previous=copy.deepcopy(first); previous['allocations'][0]['palette_cache']['bg'][0]^=1
        after=self.report(previous=previous)
        self.assertEqual(after['allocations'][0]['palette_cache']['bg'],first['allocations'][0]['palette_cache']['bg'])

    def test_tool_content_change_invalidates_the_persisted_palette_cache(self):
        first=self.report()
        with patch.object(self.assetc,'palette_cache_tool_signature',return_value='other-algorithm'),patch.object(self.assetc,'pack_global_bg_palette_key',wraps=self.assetc.pack_global_bg_palette_key) as bg:
            self.report(previous=first)
        self.assertGreater(bg.call_count,0)

    def test_lookup_is_built_once_per_scope_with_independent_mutable_results(self):
        report=self.lookup_report(); expected=self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','hero')
        with self.assetc.obj_lookup_cache_scope(),patch.object(self.assetc,'build_obj_sprite_tile_lookup',wraps=self.assetc.build_obj_sprite_tile_lookup) as build:
            first=self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','first')
            second=self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','second')
            self.assertEqual(first,expected); self.assertEqual(second,expected); self.assertEqual(build.call_count,1)
            first[0].clear(); self.assertEqual(self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','third'),expected)

    def test_lookup_cache_separates_allocation_options_and_streaming_symbol(self):
        report=self.lookup_report(); changed=copy.deepcopy(report); changed['export_plan']['headers'][0]['assetc_args']+=['--stream-frames']; changed['export_plan']['headers'][0]['symbol']='streamed'
        other=copy.deepcopy(report); other['export_plan']['headers'][0]['assetc_args'][5]='40'; other['export_plan']['headers'][0]['assetc_args'][7]='5'
        expected=[self.assetc.obj_sprite_tile_lookup_for_asset(r,self.root,'hero','uncached') for r in [report,changed,other]]
        with self.assetc.obj_lookup_cache_scope():
            self.assertEqual([self.assetc.obj_sprite_tile_lookup_for_asset(r,self.root,'hero','cached') for r in [report,changed,other]],expected)
            returned=self.assetc.obj_sprite_tile_lookup_for_asset(changed,self.root,'hero','mutable'); returned[3]['symbol']='wrong'
            self.assertEqual(self.assetc.obj_sprite_tile_lookup_for_asset(changed,self.root,'hero','again')[3]['symbol'],'streamed')

    def test_lookup_cache_checks_changed_bytes_even_when_png_metadata_matches(self):
        report=self.lookup_report()
        with self.assetc.obj_lookup_cache_scope(),patch.object(self.assetc,'build_obj_sprite_tile_lookup',wraps=self.assetc.build_obj_sprite_tile_lookup) as build:
            self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','old'); self.replace_image(); self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','new'); self.assertEqual(build.call_count,2)

    def test_lookup_preserves_dimensions_depth_and_flip_mapping(self):
        configs=[['--sprite-width','8','--sprite-height','8','--sprite-bpp','8'],
                 ['--sprite-width','16','--sprite-height','16','--stream-frames'],
                 ['--sprite-width','16','--sprite-height','16','--destination-tile','32']]
        reports=[self.lookup_report(assetc_args=args) for args in configs]
        expected=[self.assetc.obj_sprite_tile_lookup_for_asset(r,self.root,'hero','uncached') for r in reports]
        with self.assetc.obj_lookup_cache_scope():
            actual=[self.assetc.obj_sprite_tile_lookup_for_asset(r,self.root,'hero','cached') for r in reports]
            self.assertEqual(actual,expected)
            self.assertEqual(actual[0][1:3],(0,8))

    def test_lookup_budget_does_not_store_oversized_tables(self):
        report=self.lookup_report()
        with self.assetc.obj_lookup_cache_scope(),patch.object(self.assetc,'OBJ_LOOKUP_CACHE_MAX_KEYS',1),patch.object(self.assetc,'build_obj_sprite_tile_lookup',wraps=self.assetc.build_obj_sprite_tile_lookup) as build:
            self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','first')
            self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','second')
            self.assertEqual(build.call_count,2)

    def test_export_entrypoint_always_releases_its_lookup_scope_on_error(self):
        with self.assertRaises(SystemExit):
            self.assetc.emit_export_project({'backend':'invalid'},self.root,self.root/'export')
        self.assertIsNone(self.assetc.OBJ_LOOKUP_CACHE.get())

    def test_scope_releases_entries_on_failure_and_never_reuses_between_exports(self):
        report=self.lookup_report()
        with patch.object(self.assetc,'build_obj_sprite_tile_lookup',wraps=self.assetc.build_obj_sprite_tile_lookup) as build:
            with self.assertRaisesRegex(RuntimeError,'failed'):
                with self.assetc.obj_lookup_cache_scope():
                    self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','first'); raise RuntimeError('failed')
            with self.assetc.obj_lookup_cache_scope():self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','second')
            self.assertEqual(build.call_count,2)

    def test_lookup_cache_evicts_entries_when_its_budget_is_reached(self):
        report=self.lookup_report()
        with self.assetc.obj_lookup_cache_scope(),patch.object(self.assetc,'OBJ_LOOKUP_CACHE_MAX_ENTRIES',1),patch.object(self.assetc,'build_obj_sprite_tile_lookup',wraps=self.assetc.build_obj_sprite_tile_lookup) as build:
            self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','first')
            second=copy.deepcopy(report); second['export_plan']['headers'][0]['symbol']='other'; self.assetc.obj_sprite_tile_lookup_for_asset(second,self.root,'hero','second')
            self.assetc.obj_sprite_tile_lookup_for_asset(report,self.root,'hero','again'); self.assertEqual(build.call_count,3)


class BackgroundCacheTests(unittest.TestCase):
    setUp=DerivedCacheTests.setUp
    replace_image=DerivedCacheTests.replace_image
    # Reuse the PNG fixture helpers without repeating the inherited OBJ suite.
    def pixels(self):
        return self.assetc.read_png(self.image,max_colors=256,include_transparency=True)

    def background(self,pixels=None,**options):
        width,height,colors,indices,transparent=self.pixels() if pixels is None else pixels
        return self.assetc.build_cached_4bpp_background(width,height,colors,indices,transparent,**options)

    def test_background_equivalent_content_and_report_modes_share_conversion(self):
        pixels=self.pixels(); reference={'colors':[(248,0,0),(0,248,0)]}
        expected=self.assetc.build_4bpp_background(*pixels,optimize_tile_budget=8,return_optimization=True,reference_plan=reference)
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            first=self.background(optimize_tile_budget=8,reference_plan=reference)
            second=self.background(copy.deepcopy(pixels),optimize_tile_budget=8,return_optimization=True,reference_plan=copy.deepcopy(reference))
            self.assertEqual(first,expected[:5]);self.assertEqual(second,expected);self.assertEqual(build.call_count,1)

    def test_background_key_separates_dimensions_pixels_and_all_conversion_options(self):
        original=self.pixels()
        variants=[(original,{}),((8,32,*original[2:]),{}),(original,{'optimize_tile_budget':1}),(original,{'max_palette_banks':1}),(original,{'reference_plan':{'colors':[(0,0,248),(0,248,0)]}})]
        changed=copy.deepcopy(original);changed[2][0]=(0,0,248);variants.append((changed,{}))
        changed=copy.deepcopy(original);changed[3][0]=1-changed[3][0];variants.append((changed,{}))
        variants.append(((*original[:4],0),{}))
        expected=[self.assetc.build_4bpp_background(*p,**o) for p,o in variants]
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            actual=[self.background(p,**o) for p,o in variants]
            self.assertEqual(actual,expected);self.assertEqual(build.call_count,len(variants))

    def test_background_in_place_changes_cannot_reuse_old_pixels_or_reference(self):
        pixels=self.pixels();reference={'colors':[(248,0,0),(0,248,0)]}
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background(pixels,reference_plan=reference)
            pixels[3][0]=1-pixels[3][0];self.background(pixels,reference_plan=reference)
            reference['colors'][0]=(0,0,248);self.background(pixels,reference_plan=reference)
            self.assertEqual(build.call_count,3)

    def test_background_png_and_reference_bytes_with_same_metadata_are_reprocessed(self):
        reference=self.root/'reference.json';reference.write_text(json.dumps({'banks':[[[248,0,0],[0,248,0]]],'tile_palette_banks':[0]*4}))
        asset={'name':'bg','background_palette_reference':'reference.json'}
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background(reference_plan=self.assetc.background_palette_reference_plan(asset,self.root))
            self.replace_image();self.background(reference_plan=self.assetc.background_palette_reference_plan(asset,self.root))
            stat=reference.stat();text=reference.read_text().replace('[248, 0, 0]','[0, 0, 248]');reference.write_text(text);os.utime(reference,ns=(stat.st_atime_ns,stat.st_mtime_ns))
            self.assertEqual(reference.stat().st_size,stat.st_size)
            self.background(reference_plan=self.assetc.background_palette_reference_plan(asset,self.root))
            self.assertEqual(build.call_count,3)

    def test_background_cached_results_are_independent_mutable_copies(self):
        with self.assetc.background_cache_scope():
            expected=self.background(optimize_tile_budget=8,return_optimization=True)
            altered=self.background(optimize_tile_budget=8,return_optimization=True)
            altered[0].clear();altered[1][0].clear();altered[2].clear();altered[5]['tile_count_after']=-1
            self.assertEqual(self.background(optimize_tile_budget=8,return_optimization=True),expected)

    def test_background_cache_is_bounded_and_evicts_least_recent_entries(self):
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'BACKGROUND_CACHE_MAX_ENTRIES',1),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background();self.background(max_palette_banks=1);self.background()
            self.assertEqual(build.call_count,3);self.assertEqual(len(self.assetc.BACKGROUND_4BPP_CACHE.get()['entries']),1)

    def test_background_oversized_results_are_not_retained(self):
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'BACKGROUND_CACHE_MAX_VALUES',1),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background();self.background();self.assertEqual(build.call_count,2)
            self.assertEqual(self.assetc.BACKGROUND_4BPP_CACHE.get()['values'],0)

    def test_background_value_budget_evicts_without_exceeding_the_limit(self):
        with self.assetc.background_cache_scope():
            self.background();limit=self.assetc.BACKGROUND_4BPP_CACHE.get()['values']
        with self.assetc.background_cache_scope(),patch.object(self.assetc,'BACKGROUND_CACHE_MAX_VALUES',limit),patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background();self.background(max_palette_banks=1)
            self.assertLessEqual(self.assetc.BACKGROUND_4BPP_CACHE.get()['values'],limit)
            self.background();self.assertEqual(build.call_count,3)

    def test_background_successful_report_releases_cache_results(self):
        with contextlib.redirect_stderr(io.StringIO()):
            report=self.assetc.emit_pack_report({'assets':self.assets},self.root)
        self.assertTrue(report['ok'],report['errors'])
        self.assertIsNone(self.assetc.BACKGROUND_4BPP_CACHE.get())

    def test_background_nested_scope_shares_results_and_releases_on_error(self):
        cache=None
        with patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            with self.assertRaisesRegex(RuntimeError,'failed'):
                with self.assetc.background_cache_scope():
                    cache=self.assetc.BACKGROUND_4BPP_CACHE.get();self.background()
                    with self.assetc.background_cache_scope():self.background()
                    self.assertEqual(build.call_count,1);raise RuntimeError('failed')
            self.assertIsNone(self.assetc.BACKGROUND_4BPP_CACHE.get());self.assertEqual(len(cache['entries']),0)
            with self.assetc.background_cache_scope():self.background()
            self.assertEqual(build.call_count,2)

    def test_background_export_and_report_entrypoints_release_failed_scopes(self):
        with self.assertRaises(SystemExit):self.assetc.emit_export_project({'backend':'invalid'},self.root,self.root/'export')
        self.assertIsNone(self.assetc.BACKGROUND_4BPP_CACHE.get())
        with self.assertRaises(SystemExit):self.assetc.emit_pack_report(None,self.root)
        self.assertIsNone(self.assetc.BACKGROUND_4BPP_CACHE.get())

    def test_background_calls_outside_an_export_do_not_keep_global_results(self):
        with patch.object(self.assetc,'build_4bpp_background',wraps=self.assetc.build_4bpp_background) as build:
            self.background();self.background();self.assertEqual(build.call_count,2)
        self.assertIsNone(self.assetc.BACKGROUND_4BPP_CACHE.get())


if __name__=='__main__':unittest.main()
