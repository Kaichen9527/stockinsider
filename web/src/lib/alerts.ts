interface AlertPayload {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

export async function sendOpsAlert(payload: AlertPayload) {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return { delivered: false, reason: 'ALERT_WEBHOOK_URL not configured' };

  const body = {
    source: 'stockinsider',
    at: new Date().toISOString(),
    ...payload,
  };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`alert webhook failed: ${res.status}`);
  }

  return { delivered: true };
}
