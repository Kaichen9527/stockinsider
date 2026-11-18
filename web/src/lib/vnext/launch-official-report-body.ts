export async function readLaunchOfficialReportBody(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('launch_official_report_body_unavailable');
  const pieces: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) throw Error('launch_official_report_body_bound');
      pieces.push(next.value);
    }
    return Buffer.concat(pieces, bytes);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
