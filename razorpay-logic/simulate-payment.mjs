import https from 'node:https';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const amount = Number(process.env.RZP_AMOUNT || process.argv[4] || 10000);
const currency = process.env.RZP_CURRENCY || 'INR';
const receipt = process.env.RZP_RECEIPT || `rcpt_${Date.now()}`;
const title = process.env.RZP_TITLE || 'Test Payment';
const description = process.env.RZP_DESCRIPTION || 'Razorpay test-mode payment simulation';
const customerName = process.env.RZP_CUSTOMER_NAME || 'Test User';
const customerEmail = process.env.RZP_CUSTOMER_EMAIL || 'test@example.com';

if (!keyId || !keySecret) {
  console.error('Usage: set RZP_KEY_ID and RZP_KEY_SECRET in .env, or pass them as arguments.');
  process.exit(1);
}

if (!Number.isFinite(amount) || amount <= 0) {
  console.error('RZP_AMOUNT must be a positive number in the smallest currency unit, for example 10000 for INR 100.');
  process.exit(1);
}

const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
const endpoint = new URL('/v1/orders', baseUrl);
const orderPayload = JSON.stringify({
  amount,
  currency,
  receipt,
  payment_capture: 1,
  notes: {
    purpose: 'simulate-payment',
  },
});

const { statusCode, statusMessage, bodyText } = await new Promise((resolve, reject) => {
  const request = https.request(
    {
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(orderPayload),
        'User-Agent': 'razorpay-payment-sim/1.0',
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
  request.write(orderPayload);
  request.end();
});

let body;

try {
  body = bodyText ? JSON.parse(bodyText) : null;
} catch {
  body = bodyText;
}

if (!(statusCode >= 200 && statusCode < 300)) {
  console.error(`Failed to create Razorpay order. HTTP ${statusCode} ${statusMessage}`);
  if (body && typeof body === 'object') {
    console.error(JSON.stringify(body, null, 2));
  } else if (bodyText) {
    console.error(bodyText);
  }
  process.exit(1);
}

if (!body || typeof body !== 'object' || !body.id) {
  console.error('Order created, but the response did not include an order id.');
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const checkoutHtmlPath = resolve(scriptDir, 'razorpay-checkout-demo.html');
const checkoutHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Razorpay Test Checkout</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --panel: #ffffff;
        --ink: #1f2328;
        --muted: #5d6673;
        --accent: #0f766e;
        --accent-2: #d97706;
        --border: rgba(31, 35, 40, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, 'Times New Roman', serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 32%),
          radial-gradient(circle at bottom right, rgba(217, 119, 6, 0.15), transparent 28%),
          linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(720px, 100%);
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(31, 35, 40, 0.12);
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3.25rem);
        line-height: 0.95;
      }
      p {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 1rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 22px 0;
      }
      .stat {
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 14px 16px;
        background: linear-gradient(180deg, #fff 0%, #fcfaf6 100%);
      }
      .label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .value {
        font-size: 1.08rem;
        font-weight: 700;
        word-break: break-word;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 14px 20px;
        font-size: 1rem;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--accent), #115e59);
        cursor: pointer;
      }
      button:hover { filter: brightness(1.03); }
      #status {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px dashed var(--border);
        background: rgba(255, 255, 255, 0.72);
        white-space: pre-wrap;
      }
      @media (max-width: 640px) {
        .card { padding: 20px; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Razorpay Test Checkout</h1>
      <p>This page is wired to the freshly created test order. Click the button and use Razorpay test card details to simulate a payment.</p>
      <div class="grid">
        <div class="stat"><div class="label">Order ID</div><div class="value">${body.id}</div></div>
        <div class="stat"><div class="label">Amount</div><div class="value">${amount} ${currency}</div></div>
        <div class="stat"><div class="label">Receipt</div><div class="value">${receipt}</div></div>
        <div class="stat"><div class="label">Customer</div><div class="value">${customerName}</div></div>
      </div>
      <button id="payButton">Pay with Razorpay</button>
      <div id="status">Waiting for checkout...</div>
    </main>

    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      const statusEl = document.getElementById('status');
      const options = {
        key: ${JSON.stringify(keyId)},
        amount: ${amount},
        currency: ${JSON.stringify(currency)},
        name: ${JSON.stringify(title)},
        description: ${JSON.stringify(description)},
        order_id: ${JSON.stringify(body.id)},
        prefill: {
          name: ${JSON.stringify(customerName)},
          email: ${JSON.stringify(customerEmail)}
        },
        theme: {
          color: '#0f766e'
        },
        handler: function (response) {
          statusEl.textContent = 'Payment success:\\n' + JSON.stringify(response, null, 2);
        }
      };

      document.getElementById('payButton').addEventListener('click', () => {
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
          statusEl.textContent = 'Payment failed:\\n' + JSON.stringify(response.error, null, 2);
        });
        rzp.open();
      });
    </script>
  </body>
</html>
`;

writeFileSync(checkoutHtmlPath, checkoutHtml, 'utf8');

console.log('Razorpay order created.');
console.log(`Order ID: ${body.id}`);
console.log(`Checkout demo saved to: ${checkoutHtmlPath}`);
console.log('Open the HTML file and click the button to simulate a test payment.');
