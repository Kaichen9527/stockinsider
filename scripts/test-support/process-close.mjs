import { once } from 'node:events';

/** Wait for the child's process AND stdio pipes, not merely process exit.
 * Attach immediately after spawn. Rejection retains the original spawn error.
 * This changes transport completion only, never database acceptance semantics.
 */
export async function waitForProcessClose(child) {
  const [code] = await once(child, 'close');
  return code;
}
