interface AlertPayload {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

type OpsAlertBody = AlertPayload & {
  source: 'stockinsider';
  at: string;
  text?: string;
};

function isSlackIncomingWebhook(webhook: string) {
  try {
    return new URL(webhook).hostname.toLowerCase() === 'hooks.slack.com';
  } catch {
    return false;
  }
}

export function buildOpsAlertBody(webhook: string, payload: AlertPayload): OpsAlertBody {
  const body: OpsAlertBody = {
    source: 'stockinsider',
    at: new Date().toISOString(),
    ...payload,
  };

  // Slack Incoming Webhooks reject an otherwise-valid generic JSON body unless
  // it contains a display field such as `text`. Keep the generic schema for
  // other receivers and add the required, human-readable fallback only for
  // the known Slack endpoint.
  if (isSlackIncomingWebhook(webhook)) {
    return {
      ...body,
      text: `[${payload.level.toUpperCase()}] ${payload.title}: ${payload.message}`,
    };
  }

  return body;
}

export async function sendOpsAlert(payload: AlertPayload) {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return { delivered: false, reason: 'ALERT_WEBHOOK_URL not configured' };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildOpsAlertBody(webhook, payload)),
  });

  if (!res.ok) {
    throw new Error(`alert webhook failed: ${res.status}`);
  }

  return { delivered: true };
}
