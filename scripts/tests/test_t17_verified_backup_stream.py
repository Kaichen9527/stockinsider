"""Real kernel-sealed public ciphertext -> GCM -> actual owned PG engine.

This does NOT fabricate positive OS admission. Cloud main CLI is tested for
actual rejection; engine+crypto success are separately composed real operations.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import fcntl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from deployment.staging.vnext.t17_keyfd.verified_backup_stream import (
    owned_staging_key,read_manifest,VerifiedBackupStream,BackupStreamRejected)
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import restore_owned_database
from deployment.staging.vnext.t17_keyfd.stage_database_restore import _validate_receipt_counts
from deployment.staging.vnext.t17_keyfd.portable_restore_engine import RestoreEngineRejected
from deployment.staging.vnext.t17_keyfd.sealed_fixture import F_ADD_SEALS,REQUIRED_SEALS

ROOT=Path(__file__).resolve().parents[2]
KEY=b'\x71'*32


def sealed_readonly(data):
    fd=os.memfd_create('public-stream-fixture',os.MFD_ALLOW_SEALING|os.MFD_CLOEXEC)
    os.write(fd,data)
    fcntl.fcntl(fd,F_ADD_SEALS,REQUIRED_SEALS)
    reader=os.open('/proc/self/fd/'+str(fd),os.O_RDONLY|os.O_CLOEXEC)
    os.close(fd)
    return reader


def public_inputs(plaintext=b'PUBLIC_CUSTOM_ARCHIVE_PLACEHOLDER',changes=None):
    manifest={'schema':'stockinsider-database-export-v3','format':'pg_dump_custom',
      'databaseBytes':'76052147','snapshot':None,'snapshotStrategy':'pg_dump_internal_consistent_snapshot',
      'transport':'contabo_ssh_local_unix_socket','sourceEndpoint':'local-unix-socket:stockinsider',
      'credentialsInCommandOrArtifact':False,'remoteEphemeralCredentialsUsed':False,'ownersAndGrantsIncluded':True}
    if changes:manifest.update(changes)
    context=hashlib.sha256(json.dumps(manifest,separators=(',',':')).encode()).hexdigest()
    receipt={'manifest':manifest,'contextSha256':context,'result':{
      'plaintextBytes':len(plaintext),'plaintextSha256':hashlib.sha256(plaintext).hexdigest()}}
    header=b'SI-BACKUP-1\n'+b'\x02'*12+bytes.fromhex(context)
    ciphertext=header+AESGCM(KEY).encrypt(b'\x02'*12,plaintext,header)
    return receipt,ciphertext


def parsed(receipt):
    return read_manifest(sealed_readonly(json.dumps(receipt).encode()))


class VerifiedBackupStreamTests(unittest.TestCase):
    def test_actual_gcm_replay_and_input_mutation_cannot_bypass_authentication(self):
        receipt,cipher=public_inputs()
        key=bytearray(KEY)
        with VerifiedBackupStream(sealed_readonly(cipher),parsed(receipt),key) as stream:
            key[:]=bytes(32)  # private snapshot, not caller mutation
            # No Boolean assignment can authorize replay; it authenticates anew.
            stream.authenticated=True
            calls=[];stream.replay(calls.append)
            self.assertEqual(b''.join(calls),b'PUBLIC_CUSTOM_ARCHIVE_PLACEHOLDER')
            retained=stream._key
        self.assertEqual(retained,bytes(32))

    def test_wrong_key_corruption_truncation_digest_zero_consumers(self):
        receipt,cipher=public_inputs()
        wrong_digest=json.loads(json.dumps(receipt));wrong_digest['result']['plaintextSha256']='0'*64
        for body,key,meta in ((cipher,bytes(32),receipt),(cipher[:-1]+bytes([cipher[-1]^1]),KEY,receipt),
                              (cipher[:-1],KEY,receipt),(cipher,KEY,wrong_digest)):
            calls=[]
            with self.assertRaises(BackupStreamRejected):
                with VerifiedBackupStream(sealed_readonly(body),parsed(meta),key) as stream:
                    stream.authenticated=True
                    stream.replay(calls.append)
            self.assertEqual(calls,[])

    def test_unsealed_regular_file_and_large_memfd_refuse(self):
        receipt,cipher=public_inputs()
        with tempfile.NamedTemporaryFile() as f:
            f.write(cipher);f.flush()
            with self.assertRaises(BackupStreamRejected):
                VerifiedBackupStream(os.open(f.name,os.O_RDONLY),parsed(receipt),KEY)
        receipt,cipher=public_inputs(b'P'*65536)
        with self.assertRaises(BackupStreamRejected):
            VerifiedBackupStream(sealed_readonly(cipher),parsed(receipt),KEY)

    def test_manifest_preserves_existing_schema_gates(self):
        for change in ({'databaseBytes':True},{'databaseBytes':1.5},
                       {'schema':'stockinsider-database-export-v2'},
                       {'schema':'stockinsider-database-compact-v1'},
                       {'ownersAndGrantsIncluded':False}):
            receipt,_=public_inputs(changes=change)
            with self.assertRaises(BackupStreamRejected):parsed(receipt)
        duplicate=b'{"manifest":{},"manifest":{}}'
        with self.assertRaises(BackupStreamRejected):read_manifest(sealed_readonly(duplicate))

    def test_actual_binary_key_pipe_exact_eof_and_owned_zeroization(self):
        for payload in (KEY,KEY[:-1],KEY+b'X'):
            r,w=os.pipe();os.write(w,payload);os.close(w)
            if payload==KEY:
                with owned_staging_key(r) as key:
                    self.assertEqual(key,KEY);retained=key
                    with self.assertRaises(OSError):os.fstat(r)
                self.assertEqual(retained,bytes(32))
            else:
                with self.assertRaises(BackupStreamRejected):
                    with owned_staging_key(r):self.fail('key_consumer')

    def test_actual_crypto_to_pg17_full_object_restore_success(self):
        spec=importlib.util.spec_from_file_location('public_engine_archive',Path(__file__).with_name('test_t17_portable_restore_engine.py'))
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        with tempfile.TemporaryDirectory(prefix='t17-composed-public-',dir='/tmp') as directory:
            os.chmod(directory,0o700)
            archive=helper.public_archive(directory,large_rows=2)
            self.assertLess(len(archive)+72,65536)
            receipt,cipher=public_inputs(archive)
            with VerifiedBackupStream(sealed_readonly(cipher),parsed(receipt),KEY) as stream:
                stream.authenticate()
                result=restore_owned_database(stream.replay,Path(directory))
            self.assertTrue(result['databaseRestored'])
            self.assertTrue(result['portableContractVerified'])
            self.assertTrue(result['applicationObjectContractVerified'])
            self.assertEqual(result['lineageOrphans'],0)
            self.assertTrue(all(result['cleanup'].values()))
            _validate_receipt_counts(result)
            altered=dict(result);altered['databaseBytes']='PUBLIC_ARTICLE_MUST_NOT_BE_RELAYED'
            with self.assertRaises(RestoreEngineRejected):_validate_receipt_counts(altered)
            self.assertEqual(list(Path(directory).iterdir()),[])
            print('COMPOSED_PUBLIC_GCM_PG='+json.dumps(result,sort_keys=True))

    def test_real_cli_wrong_environment_rejects_without_os_admission_forgery(self):
        p=subprocess.run([sys.executable,str(ROOT/'scripts/staging_restore_database.py'),'--work-root','/tmp'],
                         capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,2)
        result=json.loads(p.stdout)
        self.assertIn(result['status'],('REJECTED','FAILED'))
        self.assertFalse(result['databaseRestored'])
        self.assertNotIn('PGHOST',p.stdout)


if __name__=='__main__':unittest.main()
