import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(scriptDir, '.env');

if (existsSync(envFilePath)) {
  const envFile = readFileSync(envFilePath, 'utf8');

  for (const line of envFile.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf('=');
    const name = trimmedLine.slice(0, equalsIndex).trim();
    let value = trimmedLine.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
}

const keyId = process.env.RZP_KEY_ID || process.argv[2];
const keySecret = process.env.RZP_KEY_SECRET || process.argv[3];
const baseUrl = process.env.RZP_BASE_URL || 'https://api.razorpay.com';

if (!keyId || !keySecret) {
  console.error('Usage: set RZP_KEY_ID and RZP_KEY_SECRET, or pass them as arguments.');
  console.error('Example: node verify-razorpay.mjs <key_id> <key_secret>');
  process.exit(1);
}

const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
const endpoint = new URL('/v1/payments?count=1', baseUrl);

const { statusCode, statusMessage, bodyText } = await new Promise((resolve, reject) => {
  const request = https.request(
    {
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'User-Agent': 'razorpay-key-check/1.0',
        Connection: 'close',
      },
    },
    (response) => {
      let responseText = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseText += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode || 0,
          statusMessage: response.statusMessage || '',
          bodyText: responseText,
        });
      });
    }
  );

  request.on('error', reject);
  request.end();
});

let body;

try {
  body = bodyText ? JSON.parse(bodyText) : null;
} catch {
  body = bodyText;
}

if (statusCode >= 200 && statusCode < 300) {
  console.log('Razorpay key check passed. Credentials are valid.');
  if (body && typeof body === 'object') {
    const totalCount = body.count ?? (Array.isArray(body.items) ? body.items.length : undefined);
    if (typeof totalCount !== 'undefined') {
      console.log(`Sample response count: ${totalCount}`);
    }
  }
  process.exit(0);
}

console.error(`Razorpay key check failed. HTTP ${statusCode} ${statusMessage}`);
if (body && typeof body === 'object') {
  console.error(JSON.stringify(body, null, 2));
} else if (bodyText) {
  console.error(bodyText);
}
process.exit(1);
