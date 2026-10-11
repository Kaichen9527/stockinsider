import pathlib,tarfile,json,hashlib,re
root=pathlib.Path('/tmp/si-2e-m35wlxg5');source='2e078dfdd74272d3d50dffdd4cc6c14df3152c78';release=root/'packages'/source;archive=root/'stockinsider-2e078dfd-linux-standalone.tar.gz'
def digest_stream(f):
 h=hashlib.sha256();n=0
 while True:
  b=f.read(1024*1024)
  if not b:return h.hexdigest(),n
  h.update(b);n+=len(b)
receipt=json.loads((release/'release-manifest.json').read_text());manifest=receipt['manifest'];expected={source+'/'+v['path']:v for v in manifest['files']};mh,mn=digest_stream((release/'release-manifest.json').open('rb'));expected[source+'/release-manifest.json']={'bytes':mn,'sha256':mh}
forbidden=re.compile(r'^(?:\.env(?:\..*)?|\.git|\.aws|\.ssh|\.gnupg|credentials(?:\.(?:json|ini|yaml|yml))?|secrets?(?:\.(?:json|ini|yaml|yml|env))?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$',re.I)
seen=set();files=[];dirs=0
with tarfile.open(archive,'r:gz') as t:
 for m in t:
  p=pathlib.PurePosixPath(m.name)
  assert not p.is_absolute() and '..' not in p.parts and p.parts and p.parts[0]==source,('unsafe_path',m.name)
  assert not any(forbidden.fullmatch(c)for c in p.parts),('forbidden_secret_or_env_path',m.name)
  assert not re.search(r'\.(?:pem|p12|pfx|key)$',m.name,re.I),('private_key_candidate',m.name)
  assert not m.issym() and not m.islnk(),('symlink_or_hardlink',m.name)
  if m.isdir():dirs+=1;continue
  assert m.isfile(),('special_file',m.name);assert m.name in expected and m.name not in seen;seen.add(m.name)
  x=expected[m.name];assert m.size==x['bytes'];f=t.extractfile(m);assert f is not None
  with f:h,n=digest_stream(f)
  assert n==x['bytes'] and h==x['sha256'],('archive_member_changed',m.name)
  files.append({'path':m.name,'bytes':n,'sha256':h})
assert seen==set(expected)
with archive.open('rb') as f:ah,an=digest_stream(f)
result={'archivePath':str(archive),'archiveSha256':ah,'archiveBytes':an,'fileCountIncludingReleaseManifest':len(files),'releaseManifestFileCount':manifest['fileCount'],'directoryCount':dirs,'totalRegularFileBytesIncludingReleaseManifest':sum(x['bytes']for x in files),'releaseManifestJsonFileBytes':mn,'releaseManifestJsonFileSha256':mh,'manifestSha256':receipt['manifestSha256'],'allArchiveRegularMembersComparedToReleaseHashes':True,'absoluteTraversalDuplicateUnexpectedPaths':0,'symlinksHardlinksSpecialFiles':0,'dotenvOrKnownCredentialStorePrivateKeyPaths':0,'pathAuditNotGenericSecretContentScan':True,'allMembers':files}
(root/'archive-audit-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='allMembers'}))
