import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('racing_assetc',Path(__file__).resolve().parents[2]/'tools/assetc/assetc.py')
assetc=importlib.util.module_from_spec(spec);spec.loader.exec_module(assetc)
class RacingAuthoringExportTests(unittest.TestCase):
    def test_streamed_vehicle_clips(self):
        report={'export_plan':{'headers':[{'id':'car','symbol':'car','kind':'obj_sprite','assetc_args':['--stream-frames']}]}}
        output=[]
        expr=assetc.emit_racing_player_animation_set(output,{'animations':{'drive':{'asset':'car','frame_indices':[1,2],'durations':[5,5],'loops':True}}},report)
        self.assertIn('&racing_player_drive_animation',expr)
        self.assertIn('car_frame_2_tile_asset','\n'.join(output))
    def test_room_players_and_combined_braking_clips(self):
        report={'export_plan':{'headers':[{'id':name,'symbol':name,'kind':'obj_sprite','assetc_args':['--stream-frames']} for name in ('overhead','rear')]}}
        def player(asset):
            return {'idle_metasprite':{'asset':asset,'index':0},'drive_metasprite':{'asset':asset,'index':1},
                    'animations':{'drive':{'asset':asset,'frame_indices':[1,2],'durations':[6,6],'loops':True},
                                  'brake_left':{'asset':asset,'frame_indices':[6],'durations':[60],'loops':True},
                                  'brake_right':{'asset':asset,'frame_indices':[9],'durations':[60],'loops':True}}}
        room={'width_tiles':30,'height_tiles':20,'collision_flags':[0]*600,'config':{'presentation':'topdown'}}
        header=assetc.emit_racing_project_data_header({'rooms':[{**room,'player':player('overhead')},{**room,'player':player('rear')}],'player':player('overhead')},report)
        self.assertIn('racing_room_0_player_drive_animation',header)
        self.assertIn('racing_room_1_player_brake_left_animation',header)
        self.assertIn('racing_room_1_player_brake_right_animation',header)
        self.assertIn('&racing_room_0_player_visual',header)
        self.assertIn('&racing_room_1_player_visual',header)
        self.assertIn('rear_frame_9_tile_asset',header)
    def test_all_authored_overhead_directions_are_emitted(self):
        report={'export_plan':{'headers':[{'id':'car','symbol':'car','kind':'obj_sprite','assetc_args':['--stream-frames']}]}}
        animations={f'{action}_{direction}':{'asset':'car','frame_indices':[index*4+offset],'loops':action!='hurt'}
                    for index,direction in enumerate(('up','right','down','left')) for action,offset in (('idle',0),('drive',1),('hurt',3))}
        output=[]
        expr=assetc.emit_racing_player_animation_set(output,{'animations':animations},report)
        for direction in ('up','right','down','left'):
            for action in ('idle','drive','hurt'):
                self.assertIn(f'&racing_player_{action}_{direction}_animation',expr)
        self.assertIn('car_frame_15_tile_asset','\n'.join(output))
    def test_camera_and_authored_floor(self):
        room={'width_tiles':16,'height_tiles':16,'collision_flags':[0]*256,'config':{'presentation':'pseudo3d'},
              'pseudo3d_visual':0,'perspective_camera':{'height':40,'distance':72,'focal_length':110},'floor_tilemap':[0]*256}
        report={'export_plan':{'headers':[{'id':'floor','symbol':'floor','kind':'affine_bg'}]}}
        header=assetc.emit_racing_project_data_header({'rooms':[room],'pseudo3d_visuals':[{'floor':'floor'}]},report)
        self.assertIn('gbs::RacingCameraConfig { 40, 72, 110 }',header)
        self.assertIn('racing_room_0_floor',header)
        self.assertIn('floor_tilemap_asset.entries[0]',header)
    def test_invalid_affine_map_rejected(self):
        room={'width_tiles':30,'height_tiles':20,'collision_flags':[0]*600,'config':{'presentation':'pseudo3d'},'floor_tilemap':[0]*600}
        with self.assertRaises(SystemExit): assetc.emit_racing_project_data_header({'rooms':[room]})
    def test_erased_floor_uses_a_transparent_tile(self):
        room={'width_tiles':16,'height_tiles':16,'collision_flags':[0]*256,'config':{'presentation':'pseudo3d'},'pseudo3d_visual':0,'floor_tilemap':[-1]+[0]*255}
        report={'export_plan':{'headers':[{'id':'floor','symbol':'floor','kind':'affine_bg'}]}}
        header=assetc.emit_racing_project_data_header({'rooms':[room],'pseudo3d_visuals':[{'floor':'floor'}]},report)
        self.assertIn('racing_room_0_floor_empty_tile',header)
if __name__=='__main__':unittest.main()
