import { expect, type Page } from '@playwright/test';

export function installConsoleErrorGate(page: Page) {
  const issues: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    issues.push(`console:${msg.text()}`);
  });

  page.on('pageerror', (error) => {
    issues.push(`pageerror:${error.message}`);
  });

  return async () => {
    expect(
      issues,
      issues.length > 0 ? `Unexpected console/page errors:\n${issues.join('\n')}` : undefined,
    ).toEqual([]);
  };
}
