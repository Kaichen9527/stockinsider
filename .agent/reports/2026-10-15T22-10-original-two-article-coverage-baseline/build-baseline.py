import hashlib
import json
import pathlib
import re
import subprocess

REPO = pathlib.Path('/tmp/stockinsider-discovery-release-root-review-oct14')
OUT = pathlib.Path(__file__).parent
SUBJECT = '15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb'
SOURCES = [
    ('2409', 'docs/research/2026-10-08-auo-four-segment-model'),
    ('2383', 'docs/research/2026-10-08-emc-company-model'),
]

def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])

def sha(data):
    return hashlib.sha256(data).hexdigest()

def kind(line):
    s = line.decode('utf-8').strip()
    if not s:
        return 'whitespace'
    if re.match(r'^#{1,6} ', s):
        return 'heading'
    if s.startswith('|'):
        return 'table'
    if re.match(r'^\[[^\]]+\]:', s):
        return 'reference-definition'
    if s.startswith('<'):
        return 'html'
    return 'prose'

articles = []
for symbol, directory in SOURCES:
    source_path = directory + '/article.md'
    metadata_path = directory + '/draft-metadata.json'
    data = git('show', SUBJECT + ':' + source_path)
    metadata_bytes = git('show', SUBJECT + ':' + metadata_path)
    metadata = json.loads(metadata_bytes)
    assert metadata['articleSha256'] == sha(data), 'historical metadata/article mismatch'
    assert metadata['published'] is False
    assert metadata['historicalPITEligible'] is False
    assert metadata['strategyApproved'] is False
    assert metadata['targetPrice'] is None
    raw_dir = OUT / 'source' / symbol
    raw_dir.mkdir(parents=True, exist_ok=False)
    (raw_dir / 'article.md').write_bytes(data)
    (raw_dir / 'draft-metadata.json').write_bytes(metadata_bytes)
    lines = data.splitlines(keepends=True)
    blocks = []
    offset = 0
    section = None
    for index, line in enumerate(lines, 1):
        k = kind(line)
        if k == 'heading':
            section = line.decode('utf-8').strip()
        if blocks and blocks[-1]['kind'] == k and k != 'heading':
            b = blocks[-1]
            b['endLineInclusive'] = index
            b['endByteExclusive'] += len(line)
        else:
            blocks.append(dict(kind=k, section=section, startLine=index,
                               endLineInclusive=index, startByte=offset,
                               endByteExclusive=offset + len(line)))
        offset += len(line)
    reconstructed = b''
    for index, b in enumerate(blocks, 1):
        fragment = data[b['startByte']:b['endByteExclusive']]
        b['blockId'] = symbol + ':' + str(index)
        b['sha256'] = sha(fragment)
        b['bytes'] = len(fragment)
        if b['kind'] == 'table':
            b['rowsIncludingHeaderAndSeparator'] = len(fragment.splitlines())
            b['header'] = fragment.splitlines()[0].decode('utf-8')
        if b['kind'] == 'heading':
            b['heading'] = fragment.decode('utf-8').strip()
        reconstructed += fragment
    assert reconstructed == data
    text = data.decode('utf-8')
    defined = sorted(set(re.findall(r'^\[([^\]]+)\]:', text, re.M)))
    body = re.sub(r'^\[[^\]]+\]:.*$', '', text, flags=re.M)
    referenced = sorted(set(re.findall(r'\[([A-Z][A-Z0-9]*)\]', body)))
    articles.append(dict(
        symbol=symbol, sourcePath=source_path, subject=SUBJECT,
        blobOid=git('rev-parse', SUBJECT + ':' + source_path).decode().strip(),
        bytes=len(data), sha256=sha(data), lines=len(lines),
        metadataPath=metadata_path, metadataSha256=sha(metadata_bytes),
        metadataArticleSha256Matched=True, originalPublished=False,
        originalHistoricalPITEligible=False, originalStrategyApproved=False,
        originalTargetPrice=None, blocks=blocks,
        referenceLabelsDefined=defined, referenceLabelsUsed=referenced,
        unresolvedReferenceLabels=sorted(set(referenced) - set(defined)),
        bytePartitionReconstructionMatched=True))

manifest = dict(
    schema='root-original-article-coverage-baseline-v1', subject=SUBJECT,
    scope='Mechanical source preservation baseline for two original complete draft articles.',
    limitation='Blocks are lexical spans, not certified claims or semantic approval. This is not author execution, a new cutoff, qualification, publication, or a test of the incoming candidate. Exact preservation is evidence for review; paraphrase equivalence and typed citation coverage require separate review.',
    articles=articles)
(OUT / 'coverage-baseline.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
summary = [dict(symbol=a['symbol'], sha256=a['sha256'], bytes=a['bytes'],
                blocks=len(a['blocks']), tables=sum(b['kind']=='table' for b in a['blocks']),
                headings=sum(b['kind']=='heading' for b in a['blocks']),
                unresolvedReferenceLabels=a['unresolvedReferenceLabels']) for a in articles]
print(json.dumps(dict(subject=SUBJECT, articles=summary, reconstructionMatched=True), ensure_ascii=False))
