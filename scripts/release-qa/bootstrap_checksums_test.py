import hashlib
from pathlib import Path
import tempfile
import unittest
from bootstrap_checksums import build_checksums, expected_packages, normalized


class BootstrapChecksumsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.version = '0.1.0-rc.5'; self.tag = 'v'+self.version; self.sha = 'a'*40
        (self.root/'GBA-Studio-windows-x64').mkdir(); (self.root/'GBA-Studio-linux-x64').mkdir(); (self.root/'extras').mkdir()
        for name in expected_packages(self.version):
            platform = 'windows' if name.endswith('.exe') or name.endswith('-win.zip') or '-windows-' in name else 'linux'
            (self.root/f'GBA-Studio-{platform}-x64'/name).write_bytes(name.encode())
        self.assets = {}; files=[]
        for arch in ['arm64','x64']:
            for ext in ['dmg','zip']:
                name=f'GBA-Studio-{self.version}-macOS-{arch}.{ext}'
                part=f'upload-chunk-mac-{arch}-{ext}-000.part'; data=name.encode(); h=hashlib.sha256(data).hexdigest()
                files.append({'name':name,'bytes':len(data),'sha256':h,'parts':[{'name':part,'bytes':len(data),'sha256':h}]})
                self.assets[part]={'state':'uploaded','size':len(data),'digest':'sha256:'+h}
        self.manifest={'tag':self.tag,'sourceTagTarget':self.sha,'files':files}
        for name in ['BUILD_INFO.json','VALIDATION.md','RELEASE_NOTES.md'] + [f'GBA-Studio-{self.version}-macos-{arch}-licenses-and-sources.zip' for arch in ['arm64','x64']]:
            data=name.encode();(self.root/'extras'/name).write_bytes(data)
            self.assets[name]={'state':'uploaded','size':len(data),'digest':'sha256:'+hashlib.sha256(data).hexdigest()}

    def tearDown(self): self.tmp.cleanup()
    def check(self): return build_checksums(self.root,self.manifest,self.version,self.tag,self.sha,self.assets)
    def test_builds_all_16_hashes(self):
        self.assertEqual(len(self.check()),16)
        self.assertEqual(normalized('GBA Studio Setup '+self.version+'.exe',self.version),'GBA.Studio.Setup.'+self.version+'.exe')
    def test_rejects_changed_chunk(self):
        self.assets[self.manifest['files'][0]['parts'][0]['name']]['digest']='sha256:'+'0'*64
        with self.assertRaises(AssertionError): self.check()
    def test_rejects_wrong_source_commit(self):
        self.manifest['sourceTagTarget']='b'*40
        with self.assertRaises(AssertionError): self.check()
    def test_rejects_unexpected_or_missing_package(self):
        (self.root/'GBA-Studio-linux-x64'/'unrelated.zip').write_bytes(b'x')
        with self.assertRaises(AssertionError): self.check()

if __name__ == '__main__': unittest.main()
