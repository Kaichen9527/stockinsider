"""Synthetic SI-BACKUP-1 two-pass GCM exercise; no PG/live execution adapter.

The supplied key must be PUBLIC fixture data, never a production recovery key.
No path, permission flag, readiness bool or receipt is accepted. Memory stays
O(chunk); no complete plaintext archive is retained or written to disk.
"""
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.exceptions import InvalidTag
from .disk_custody import _DiskSnapshot

MAGIC = b'SI-BACKUP-1\n'
HEADER = len(MAGIC) + 12 + 32


class FixtureAuthenticationRejected(Exception):
    pass


def authenticate_then_replay(snapshot, fixture_key, expected_context, consumer):
    """Authenticate ALL sealed ciphertext before any consumer; replay SAME FD.

    Each pass uses the same private key/context copies; second pass may stream
    before its own final tag because first-pass authentication covered exactly
    these immutable bytes. Actual provenance/key recovery remain absent.
    """
    if (type(snapshot) is not _DiskSnapshot or len(fixture_key) != 32
            or len(expected_context) != 32 or snapshot.size <= HEADER + 16):
        raise FixtureAuthenticationRejected('fixture_input_rejected')
    key = bytearray(fixture_key)
    context = bytes(expected_context)
    try:
        header = b''.join(snapshot.chunks(0, HEADER))
        if header[:len(MAGIC)] != MAGIC or header[-32:] != context:
            raise FixtureAuthenticationRejected('fixture_context_rejected')
        iv = header[len(MAGIC):len(MAGIC) + 12]
        tag = b''.join(snapshot.chunks(snapshot.size - 16, 16))
        for replay in (False, True):
            decryptor = Cipher(algorithms.AES(key), modes.GCM(iv, tag)).decryptor()
            decryptor.authenticate_additional_data(header)
            for chunk in snapshot.chunks(HEADER, snapshot.size - HEADER - 16):
                plaintext = decryptor.update(chunk)
                if replay:
                    consumer(plaintext)
                del plaintext
            final = decryptor.finalize()
            if replay and final:
                consumer(final)
    except InvalidTag:
        raise FixtureAuthenticationRejected('fixture_tag_rejected') from None
    finally:
        key[:] = b'\0' * len(key)
