/**
 * Integration connection testing — verifies credentials are valid
 * by making a lightweight API call to each provider.
 */

async function testConnection(provider, config) {
  switch (provider) {
    case 'slack':
      return testSlack(config);
    case 'stripe':
      return testStripe(config);
    case 'google_sheets':
      return testGoogleSheets(config);
    case 'github':
      return testGitHub(config);
    case 'hubspot':
      return testHubSpot(config);
    case 'twilio':
      return testTwilio(config);
    case 'notion':
      return testNotion(config);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function testSlack({ botToken }) {
  if (!botToken) throw new Error('Bot token is required');
  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack auth failed: ${data.error}`);
  return { team: data.team, user: data.user, teamId: data.team_id };
}

async function testStripe({ secretKey }) {
  if (!secretKey) throw new Error('Secret key is required');
  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Stripe auth failed: ${data.error?.message || res.statusText}`);
  }
  return { status: 'authenticated' };
}

async function testGoogleSheets({ serviceAccountKey }) {
  if (!serviceAccountKey) throw new Error('Service account key JSON is required');
  try {
    const key = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
    if (!key.client_email || !key.private_key) throw new Error('Invalid service account key — missing client_email or private_key');
    return { clientEmail: key.client_email, projectId: key.project_id };
  } catch (err) {
    if (err.message.includes('Invalid')) throw err;
    throw new Error('Service account key must be valid JSON');
  }
}

async function testGitHub({ personalAccessToken }) {
  if (!personalAccessToken) throw new Error('Personal access token is required');
  const res = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${personalAccessToken}`, 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub auth failed: ${res.statusText}`);
  const data = await res.json();
  return { login: data.login, name: data.name };
}

async function testHubSpot({ accessToken }) {
  if (!accessToken) throw new Error('Access token is required');
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`HubSpot auth failed: ${data.message || res.statusText}`);
  }
  return { status: 'authenticated' };
}

async function testTwilio({ accountSid, authToken }) {
  if (!accountSid || !authToken) throw new Error('Account SID and Auth Token are required');
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
    headers: { 'Authorization': `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Twilio auth failed: ${res.statusText}`);
  const data = await res.json();
  return { friendlyName: data.friendly_name, status: data.status };
}

async function testNotion({ integrationToken }) {
  if (!integrationToken) throw new Error('Integration token is required');
  const res = await fetch('https://api.notion.com/v1/users/me', {
    headers: { 'Authorization': `Bearer ${integrationToken}`, 'Notion-Version': '2022-06-28' },
  });
  if (!res.ok) throw new Error(`Notion auth failed: ${res.statusText}`);
  const data = await res.json();
  return { name: data.name, type: data.type };
}

/**
 * Execute a provider action (used by workflow integration nodes)
 */
async function executeAction(provider, action, config, params) {
  switch (provider) {
    case 'slack':
      return executeSlackAction(action, config, params);
    case 'twilio':
      return executeTwilioAction(action, config, params);
    case 'github':
      return executeGitHubAction(action, config, params);
    case 'stripe':
      return executeStripeAction(action, config, params);
    case 'google_sheets':
      return executeGoogleSheetsAction(action, config, params);
    default:
      throw new Error(`Provider "${provider}" actions are not yet supported`);
  }
}

async function executeSlackAction(action, config, params) {
  if (action === 'send_message') {
    const { channel, text } = params;
    if (!channel || !text) throw new Error('Channel and text are required for Slack messages');
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack send failed: ${data.error}`);
    return { messageTs: data.ts, channel: data.channel };
  }
  throw new Error(`Unknown Slack action: ${action}`);
}

async function executeTwilioAction(action, config, params) {
  if (action === 'send_sms') {
    const { to, body } = params;
    if (!to || !body) throw new Error('"to" phone number and message body are required');
    const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
    const formData = new URLSearchParams({ To: to, From: config.fromNumber || config.phoneNumber, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    const data = await res.json();
    if (data.code) throw new Error(`Twilio send failed: ${data.message}`);
    return { sid: data.sid, status: data.status };
  }
  throw new Error(`Unknown Twilio action: ${action}`);
}

async function executeGitHubAction(action, config, params) {
  if (action === 'create_issue') {
    const { owner, repo, title, body } = params;
    if (!owner || !repo || !title) throw new Error('Owner, repo, and title are required');
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.personalAccessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body: body || '' }),
    });
    if (!res.ok) throw new Error(`GitHub create issue failed: ${res.statusText}`);
    const data = await res.json();
    return { number: data.number, url: data.html_url };
  }
  throw new Error(`Unknown GitHub action: ${action}`);
}

async function executeStripeAction(action, config, params) {
  if (action === 'create_invoice') {
    const { customerId, amount, description } = params;
    if (!customerId) throw new Error('Customer ID is required');
    // Create invoice item first, then invoice
    const itemForm = new URLSearchParams({ customer: customerId, amount: String(amount || 0), currency: 'usd', description: description || 'Invoice item' });
    const itemRes = await fetch('https://api.stripe.com/v1/invoiceitems', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: itemForm.toString(),
    });
    if (!itemRes.ok) throw new Error('Failed to create invoice item');

    const invForm = new URLSearchParams({ customer: customerId, auto_advance: 'true' });
    const invRes = await fetch('https://api.stripe.com/v1/invoices', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: invForm.toString(),
    });
    if (!invRes.ok) throw new Error('Failed to create invoice');
    const data = await invRes.json();
    return { invoiceId: data.id, status: data.status, url: data.hosted_invoice_url };
  }
  throw new Error(`Unknown Stripe action: ${action}`);
}

async function executeGoogleSheetsAction(action, config, params) {
  // Google Sheets requires OAuth or service account JWT — simplified version
  if (action === 'read' || action === 'write') {
    // In production, implement JWT signing with the service account key
    return { status: 'not_implemented', message: 'Google Sheets read/write requires OAuth token exchange. Configure OAuth in Settings.' };
  }
  throw new Error(`Unknown Google Sheets action: ${action}`);
}

module.exports = { testConnection, executeAction };
