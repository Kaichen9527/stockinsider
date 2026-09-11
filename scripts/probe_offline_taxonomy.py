"""Operator-only local diagnostic; never writes facts or disables validation."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import shutil
import xml.etree.ElementTree as ET
from candidate_financial_document_parser import disable_network, apply_limits

document=Path(sys.argv[1]).resolve()
taxonomy=Path(sys.argv[2]).resolve()
raw=document.read_bytes()
root=ET.fromstring(raw)
refs=[node.attrib.get('{http://www.w3.org/1999/xlink}href','') for node in root.iter()
      if node.tag=='{http://www.xbrl.org/2003/linkbase}schemaRef']
mapping={}
for ref in refs:
    if '/' in ref or '\\' in ref or not ref.endswith('.xsd'):
        raise ValueError('diagnostic_requires_local_basename_schema_ref')
    candidates=list(taxonomy.rglob(ref))
    if len(candidates)!=1:
        raise ValueError('exact_taxonomy_entrypoint_not_found')
    mapping[str(document.parent/ref)]=str(candidates[0])
disable_network()
apply_limits()
with tempfile.TemporaryDirectory(prefix='stockinsider-taxonomy-probe-') as config:
    os.environ['XDG_CONFIG_HOME']=config
    from arelle import Cntlr, FileSource
    controller=Cntlr.Cntlr(logFileName='logToBuffer')
    controller.webCache.workOffline=True
    # Relocate unchanged bytes beside a private copy of the official entrypoint.
    # Mapping just the entry XSD leaves Arelle resolving its relative imports
    # against the upload directory rather than the taxonomy directory.
    staged=Path(config)/'taxonomy'
    shutil.copytree(taxonomy,staged)
    entry=staged/Path(next(iter(mapping.values()))).relative_to(taxonomy)
    staged_document=entry.parent/document.name
    staged_document.write_bytes(raw)
    source=FileSource.FileSource(str(staged_document),controller)
    model=controller.modelManager.load(source)
    controller.modelManager.validate()
    errors=list(model.errors)
    diagnostics=controller.logHandler.getLines()[:12]
    print(json.dumps({'inputSha256':hashlib.sha256(raw).hexdigest(),'facts':len(model.facts),
      'errorCount':len(errors),'errorCodes':list(dict.fromkeys(str(e) for e in errors))[:25],
      'diagnostics':diagnostics}))
    model.close()
    controller.close()
