#!/usr/bin/env python3
"""Read-only, exact SOHO candidate export. It never removes or retags an image."""

import json
import hashlib
import subprocess
import sys


CANDIDATES = {
    "soho-rollback/soho-api:20260912T044928Z": "sha256:ecf6c4b00fb873819f4d19e7cd6857019d5e505c2da95616ece5d5fa5c5949ee",
    "soho-rollback/soho-staging-api:20260912T042955Z": "sha256:893bca7ea9a501be71e774617fff2fe62e3c448d7e57108b88f532407b4991b5",
    "soho-rollback/soho-staging-web:20260912T042955Z": "sha256:b6598412b63bc96034c6488e7768029571dd6375eb0dd7a135631401b573aa14",
    "soho-rollback/soho-staging-worker:20260912T042955Z": "sha256:fb380e128f58dc24e727efc3fdabc706a12ba1f5ab9f26b3defb2af1a701912a",
    "soho-rollback/soho-web:20260912T044928Z": "sha256:155893cf28ec08bd0e155be21f43c05e80e5f04f3bf5ffbc56091ceee194c785",
    "soho-rollback/soho-worker:20260912T044928Z": "sha256:776a58ed0b99a0a2011045ee18cd7d55b9a37c26ff2301b9c1af40256bac71ef",
}


def emit(value):
    sys.stderr.write("STOCKINSIDER_META\t" + json.dumps(value, sort_keys=True) + "\n")
    sys.stderr.flush()


def inspect_images(refs):
    result = []
    for ref in refs:
        raw = subprocess.run(
            ["/usr/bin/docker", "image", "inspect", ref],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        value = json.loads(raw.stdout)
        if len(value) != 1:
            raise RuntimeError("image_inspect_ambiguous")
        image = value[0]
        expected = CANDIDATES[ref]
        if image.get("Id") != expected or ref not in (image.get("RepoTags") or []):
            raise RuntimeError("image_identity_changed")
        layers = image.get("RootFS", {}).get("Layers") or []
        if not layers or not all(isinstance(item, str) and item.startswith("sha256:") for item in layers):
            raise RuntimeError("image_layers_invalid")
        result.append({
            "ref": ref,
            "imageId": image["Id"],
            "configJsonSha256": hashlib.sha256(json.dumps(
                image.get("Config") or {}, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest(),
            "architecture": image.get("Architecture"),
            "os": image.get("Os"),
            "size": image.get("Size"),
            "rootFsLayers": layers,
        })
    return result


def main():
    refs = sys.argv[1:]
    if refs != sorted(CANDIDATES) or len(refs) != len(CANDIDATES):
        raise RuntimeError("exact_candidate_set_required")
    before = inspect_images(refs)
    emit({"phase": "before", "images": before})
    save = subprocess.Popen(
        ["/usr/bin/docker", "image", "save", *refs],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    compressor = subprocess.Popen(
        ["/usr/bin/zstd", "-T1", "-3", "-c"],
        stdin=save.stdout,
        stdout=sys.stdout.buffer,
        stderr=subprocess.DEVNULL,
    )
    save.stdout.close()
    compressor_status = compressor.wait()
    save_status = save.wait()
    if save_status != 0 or compressor_status != 0:
        raise RuntimeError("docker_save_failed")
    after = inspect_images(refs)
    if before != after:
        raise RuntimeError("image_identity_changed_during_export")
    emit({"phase": "after", "images": after})


try:
    main()
except Exception as error:
    emit({"phase": "failed", "reason": str(error)})
    raise SystemExit(1)
