from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/assetc"))
import assetc

class QueueExportTests(unittest.TestCase):
    def test_baud_and_native_variable_operands(self):
        cases = [
            ({"op":"multiplayer_queue_open","players":4,"baud":57600,"timeout_frames":12},("MultiplayerQueueOpen",4,2,12)),
            ({"op":"multiplayer_queue_send","var_value":3,"var_accepted":4},("MultiplayerQueueSend",3,4,0)),
            ({"op":"multiplayer_queue_receive","var_value":0,"var_player":1,"var_received":2},("MultiplayerQueueReceive",0,1,2)),
            ({"op":"multiplayer_queue_status","var_state":3,"var_player":4,"var_pending":5},("MultiplayerQueueStatus",3,4,5)),
            ({"op":"multiplayer_queue_close"},("MultiplayerQueueClose",0,0,0))]
        for command,expected in cases:
            with self.subTest(command=command):self.assertEqual(assetc.event_command_from_json(command,"test"),expected)

    def test_invalid_config_and_aliasing_fail(self):
        for command in [
            {"op":"multiplayer_queue_open","players":1,"baud":115200,"timeout_frames":30},
            {"op":"multiplayer_queue_open","players":2,"baud":12345,"timeout_frames":30},
            {"op":"multiplayer_queue_open","players":2,"baud":9600,"timeout_frames":0},
            {"op":"multiplayer_queue_send","var_value":True,"var_accepted":1},
            {"op":"multiplayer_queue_receive","var_value":0,"var_player":1,"var_received":0},
            {"op":"multiplayer_queue_status","var_state":0,"var_player":1,"var_pending":64}]:
            with self.subTest(command=command),self.assertRaises(SystemExit):assetc.event_command_from_json(command,"test")

if __name__=="__main__":unittest.main()
