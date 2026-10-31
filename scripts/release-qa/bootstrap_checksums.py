#!/usr/bin/env python3
"""Build checksums for an existing draft from its immutable CI artifacts."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def digest(path):
    sha = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(block)
    return sha.hexdigest()


def expected_packages(version):
    return {f'GBA.Studio.Setup.{version}.exe', f'GBA.Studio-{version}-win.zip',
            f'GBA-Studio-{version}-windows-x64-licenses-and-sources.zip',
            f'GBA-Studio-{version}-linux-amd64.deb', f'GBA-Studio-{version}-linux-x64.tar.gz',
            f'GBA-Studio-{version}-linux-x86_64.AppImage', f'GBA-Studio-{version}-linux-x64-licenses-and-sources.zip'}


def normalized(name, version):
    name = name.replace(' ', '.')
    for platform in ['windows-x64', 'linux-x64']:
        if name == f'GBA-Studio-{platform}-licenses-and-sources.zip':
            name = f'GBA-Studio-{version}-{platform}-licenses-and-sources.zip'
    return name


def build_checksums(stage, manifest, version, tag, sha, assets):
    assert manifest['tag'] == tag and manifest['sourceTagTarget'] == sha
    checksums = {}
    for folder in ['GBA-Studio-windows-x64', 'GBA-Studio-linux-x64']:
        for file in (stage / folder).rglob('*'):
            if not file.is_file(): continue
            name = normalized(file.name, version)
            assert name in expected_packages(version) and name not in checksums, f'Unexpected or duplicate package: {name}'
            checksums[name] = digest(file)
    assert set(checksums) == expected_packages(version), 'Missing CI package'
    expected_mac = {f'GBA-Studio-{version}-macOS-{arch}.{ext}' for arch in ['arm64', 'x64'] for ext in ['dmg', 'zip']}
    assert len(manifest['files']) == 4 and {f['name'] for f in manifest['files']} == expected_mac
    for file in manifest['files']:
        assert re.fullmatch(r'[0-9a-f]{64}', file['sha256']) and file['bytes'] > 0
        assert file['parts'] and sum(part['bytes'] for part in file['parts']) == file['bytes']
        for part in file['parts']:
            assert re.fullmatch(r'upload-chunk-mac-(arm64|x64)-(dmg|zip)-[0-9]{3}\.part', part['name'])
            asset = assets[part['name']]
            assert asset['state'] == 'uploaded' and asset['size'] == part['bytes'] and asset['digest'] == 'sha256:' + part['sha256']
        checksums[file['name']] = file['sha256']
    extra = ['BUILD_INFO.json', 'VALIDATION.md', 'RELEASE_NOTES.md'] + [f'GBA-Studio-{version}-macos-{arch}-licenses-and-sources.zip' for arch in ['arm64','x64']]
    for name in extra:
        path = stage / 'extras' / name
        asset = assets[name]
        assert path.is_file() and asset['state'] == 'uploaded' and asset['size'] == path.stat().st_size
        checksums[name] = digest(path)
        assert asset['digest'] == 'sha256:' + checksums[name]
    assert len(checksums) == 16
    return checksums


def main():
    repo, tag, run_id, sha = (os.environ[name] for name in ['GITHUB_REPOSITORY','RELEASE_TAG','PACKAGE_RUN_ID','SOURCE_SHA'])
    assert re.fullmatch(r'v[0-9][A-Za-z0-9._-]*', tag) and run_id.isdigit() and re.fullmatch(r'[0-9a-f]{40}', sha)
    version = tag.removeprefix('v')
    release = json.loads(gh('release','view',tag,'--repo',repo,'--json','assets,isDraft,tagName,targetCommitish'))
    assert release['isDraft'] and release['tagName'] == tag and release['targetCommitish'] == sha
    run = json.loads(gh('api',f'repos/{repo}/actions/runs/{run_id}'))
    assert run['head_sha'] == sha and run['conclusion'] == 'success' and run['path'] == '.github/workflows/desktop-packages.yml'
    assets = {item['name']: item for item in release['assets']}
    with tempfile.TemporaryDirectory(prefix='rc5-checksums-') as temporary:
        stage = Path(temporary)
        gh('release','download',tag,'--repo',repo,'--pattern','UPLOAD_CHUNKS.json','--dir',str(stage))
        manifest_path = stage / 'UPLOAD_CHUNKS.json'
        manifest_asset = assets['UPLOAD_CHUNKS.json']
        assert manifest_asset['state']=='uploaded' and manifest_asset['size']==manifest_path.stat().st_size and manifest_asset['digest']=='sha256:'+digest(manifest_path)
        manifest = json.loads(manifest_path.read_text())
        for name in ['GBA-Studio-windows-x64','GBA-Studio-linux-x64']:
            gh('run','download',run_id,'--repo',repo,'--name',name,'--dir',str(stage/name))
        extras = stage/'extras'; extras.mkdir()
        for name in ['BUILD_INFO.json','VALIDATION.md','RELEASE_NOTES.md'] + [f'GBA-Studio-{version}-macos-{arch}-licenses-and-sources.zip' for arch in ['arm64','x64']]:
            gh('release','download',tag,'--repo',repo,'--pattern',name,'--dir',str(extras))
        checksums = build_checksums(stage, manifest, version, tag, sha, assets)
        output = stage/'SHA256SUMS.txt'
        output.write_text(''.join(f'{value}  {name}\n' for name,value in sorted(checksums.items())))
        if 'SHA256SUMS.txt' in assets:
            asset = assets['SHA256SUMS.txt']
            assert asset['size']==output.stat().st_size and asset['digest']=='sha256:'+digest(output), 'Existing checksum file differs'
        else:
            gh('release','upload',tag,str(output),'--repo',repo)
        print(f'Prepared checksums for {len(checksums)} validated release files.')


if __name__ == '__main__': main()
