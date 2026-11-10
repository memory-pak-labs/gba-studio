from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"tools/assetc"))
import assetc

class IntegerLiteralTests(unittest.TestCase):
    def test_full_int32_literals_use_the_reserved_operand_without_narrowing(self):
        cases=[(32768,-32768,0),(65535,-1,0),(-32769,32767,-1),(2147483647,-1,32767),(-2147483648,0,-32768)]
        for value,low,high in cases:
            with self.subTest(value=value):
                self.assertEqual(assetc.event_command_from_json({"op":"set_variable","variable":2,"value":value},"test"),
                                 ("SetVariable",2,low,high,1))
        for value in (-32768,-1,0,32767):
            self.assertEqual(assetc.event_command_from_json({"op":"set_variable","variable":2,"value":value},"test"),
                             ("SetVariable",2,value,0))
        for value in (-2147483649,2147483648):
            with self.assertRaises(SystemExit):assetc.event_command_from_json({"op":"set_variable","value":value},"test")

if __name__=="__main__":unittest.main()
