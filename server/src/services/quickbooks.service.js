const env = require('../config/env');
const qboModel = require('../models/qbo.model');

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function getBaseUrl() {
  return env.qboEnvironment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: env.qboClientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: env.qboRedirectUri,
    state: state || 'monkflow',
  });
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code, realmId) {
  const credentials = Buffer.from(`${env.qboClientId}:${env.qboClientSecret}`).toString('base64');
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.qboRedirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token exchange failed: ${err}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in, // seconds
    realmId,
  };
}

async function refreshTokens(connection) {
  const credentials = Buffer.from(`${env.qboClientId}:${env.qboClientSecret}`).toString('base64');
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token refresh failed: ${err}`);
  }
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await qboModel.updateTokens(connection.user_id, data.access_token, data.refresh_token, expiresAt);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

async function ensureValidToken(connection) {
  if (new Date(connection.token_expires_at) <= new Date(Date.now() + 60000)) {
    // Token expires within 1 minute, refresh it
    const refreshed = await refreshTokens(connection);
    return refreshed.accessToken;
  }
  return connection.access_token;
}

async function qboApiCall(method, path, accessToken, realmId, body) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/v3/company/${realmId}${path}?minorversion=65`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO API error (${res.status}): ${err}`);
  }
  return res.json();
}

async function createCustomer(accessToken, realmId, userData) {
  const customerData = {
    DisplayName: `${userData.firstName || ''} ${userData.lastName || ''} - ${userData.email}`.trim(),
    PrimaryEmailAddr: { Address: userData.email },
    CompanyName: userData.company || undefined,
    GivenName: userData.firstName || undefined,
    FamilyName: userData.lastName || undefined,
  };
  const result = await qboApiCall('POST', '/customer', accessToken, realmId, customerData);
  return result.Customer;
}

async function createInvoice(accessToken, realmId, invoiceData) {
  // invoiceData: { customerRef, lineItems: [{ description, amount }], dueDate, emailTo }
  const lines = invoiceData.lineItems.map((item, i) => ({
    LineNum: i + 1,
    Amount: item.amount / 100, // Convert cents to dollars
    DetailType: 'SalesItemLineDetail',
    Description: item.description,
    SalesItemLineDetail: {
      ItemRef: { value: '1', name: 'Services' }, // Default service item
      UnitPrice: item.amount / 100,
      Qty: 1,
    },
  }));

  const invoice = {
    CustomerRef: { value: invoiceData.customerRef },
    Line: lines,
    DueDate: invoiceData.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    EmailStatus: 'NeedToSend',
    BillEmail: invoiceData.emailTo ? { Address: invoiceData.emailTo } : undefined,
  };

  const result = await qboApiCall('POST', '/invoice', accessToken, realmId, invoice);
  return result.Invoice;
}

async function sendInvoice(accessToken, realmId, qboInvoiceId, emailTo) {
  const url = emailTo ? `/invoice/${qboInvoiceId}/send?sendTo=${encodeURIComponent(emailTo)}` : `/invoice/${qboInvoiceId}/send`;
  const result = await qboApiCall('POST', url, accessToken, realmId);
  return result.Invoice;
}

async function getPayment(accessToken, realmId, paymentId) {
  const result = await qboApiCall('GET', `/payment/${paymentId}`, accessToken, realmId);
  return result.Payment;
}

async function getCompanyInfo(accessToken, realmId) {
  const result = await qboApiCall('GET', `/companyinfo/${realmId}`, accessToken, realmId);
  return result.CompanyInfo;
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  refreshTokens,
  ensureValidToken,
  createCustomer,
  createInvoice,
  sendInvoice,
  getPayment,
  getCompanyInfo,
};
