"""Exact candidate detail RPCs shared by the clone observer, grants and proxy."""

# PostgreSQL 17 definitions from candidate 41f2415 migrations 34, 41, 45 and 58.
DETAIL_PROJECTIONS = (
    ('reportedEps', 'vnext_launch_reported_eps_v1',
     '3347d9275749f0ea9426b27414e8e1607c35b0af26904c61d6c24780267897e3'),
    ('issuerEpsEstimates', 'vnext_launch_issuer_eps_estimates_v1',
     '1f14b4ba2c7b95620b68b99380afe84ef85b33ad8b558a08897413502175a396'),
    ('issuerFiscalForecasts', 'vnext_launch_issuer_fiscal_forecasts_v1',
     'eab04107e14796c4e84b58e57f8d16568d6c4ed5ee0c8777b0a43c4e263a4832'),
    ('reviewedValuation', 'vnext_launch_reviewed_valuation_v1',
     '7d5c702c61397c333e48b2a4365a57c655acd16b5c7f9ae3cf569c62446787c5'),
    ('reviewedFalsifier', 'vnext_launch_reviewed_falsifier_v1',
     '60f354f971368120219171257e6782b99e43de8de731631fd3a8fd2a897a4536'),
)
DETAIL_PROJECTION_KEYS = frozenset(key for key, _, _ in DETAIL_PROJECTIONS)
DETAIL_PROJECTION_PATHS = frozenset('/rest/v1/rpc/' + name for _, name, _ in DETAIL_PROJECTIONS)

# Constructed only from reviewed literals; no external parameters supply SQL.
DETAIL_SIGNATURE_PINS = tuple((f'public.{name}(uuid,text)', pin) for _, name, pin in DETAIL_PROJECTIONS)
DETAIL_CATALOG_ROWS = b',\n'.join(
    f" ('{key}','{signature}','{pin}')".encode('ascii')
    for (key, _, _), (signature, pin) in zip(DETAIL_PROJECTIONS, DETAIL_SIGNATURE_PINS)
)
