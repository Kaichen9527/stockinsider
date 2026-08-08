'use strict';

const { immutableBundle, invariant, sortedUnique } = require('./codec');

function pageSelectedRevisionCursor({ revisions, after = null, pageSize = 200, maximum = 1000 }) {
  invariant(Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 200, 'revision page size');
  const ordered = sortedUnique(revisions, (left, right) => String(left.identityKey).localeCompare(String(right.identityKey)));
  const retained = ordered.slice(0, maximum);
  const cursorIndex = after === null ? -1 : retained.findIndex((row) => row.identityKey === after);
  invariant(after === null || cursorIndex >= 0, 'revision cursor must exist');
  const start = cursorIndex + 1;
  const selected = retained.slice(start, start + pageSize);
  return Object.freeze({
    rows: selected,
    nextCursor: selected.length === pageSize && start + pageSize < retained.length ? selected[selected.length - 1].identityKey : null,
    selectedCount: retained.length,
    deferredCount: Math.max(0, ordered.length - maximum),
    page: immutableBundle('selected_revision_page_v3_11', selected),
  });
}

module.exports = { pageSelectedRevisionCursor };
