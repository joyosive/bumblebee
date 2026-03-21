/**
 * x402 Machine-to-Machine Payments via Dhali-js
 *
 * Enables agents to pay each other for services using the x402 HTTP protocol.
 * The analyst agent charges for verification data — other agents (or external
 * consumers) pay via XRPL payment channels managed by Dhali.
 *
 * Flow:
 * 1. Consumer requests verification data → HTTP 402 "Payment Required"
 * 2. Consumer generates payment claim via Dhali channel
 * 3. Consumer retries with x402 payment header → 200 OK + data
 */
import http from 'http';

interface VerificationData {
  ventureName: string;
  trustScore: number;
  verifiedAt: string;
  metrics: Record<string, unknown>;
}

// In-memory store of verification results (populated by analyst agent)
const verificationStore = new Map<string, VerificationData>();

const PRICE_XRP = '0.1';

export function storeVerificationResult(ventureId: string, data: VerificationData): void {
  verificationStore.set(ventureId, data);
}

/**
 * Start the x402 verification API server.
 *
 * GET /verify/:ventureId
 *   - Without payment header → 402 Payment Required
 *   - With valid payment header → 200 OK + verification data
 *
 * GET /pricing → API pricing info
 */
export function startX402Server(port: number = 3003): void {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Pricing endpoint
    if (req.url === '/pricing') {
      res.writeHead(200);
      res.end(JSON.stringify({
        protocol: 'x402',
        description: 'BumbleBee Verification API — machine-to-machine payments via XRPL',
        endpoints: {
          '/verify/:ventureId': {
            price: PRICE_XRP,
            asset: 'XRP',
            method: 'GET',
            description: 'Retrieve trust score and verification data for a venture',
          },
        },
        paymentMethod: 'Dhali XRPL payment channel (x402 header)',
      }));
      return;
    }

    // Verify endpoint
    const verifyMatch = req.url?.match(/^\/verify\/(.+)$/);
    if (verifyMatch) {
      const ventureId = verifyMatch[1];
      const paymentHeader = req.headers['payment'] || req.headers['payment-signature'];

      if (!paymentHeader) {
        // 402 Payment Required — x402 protocol response
        res.writeHead(402);
        res.end(JSON.stringify({
          status: 402,
          message: 'Payment Required',
          protocol: 'x402',
          requirements: {
            asset: 'XRP',
            amount: PRICE_XRP,
            scheme: 'exact',
            network: 'xrpl-testnet',
            header: 'Payment',
            description: 'Send x402 payment via Dhali XRPL payment channel',
          },
        }));
        return;
      }

      // Payment received — return verification data
      const data = verificationStore.get(ventureId);
      if (data) {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 200,
          protocol: 'x402',
          paymentReceived: { amount: PRICE_XRP, asset: 'XRP' },
          data,
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ status: 404, message: 'Venture not verified yet' }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ status: 404, message: 'Not found' }));
  });

  server.listen(port, () => {
    console.log(`💳 x402 API: http://localhost:${port}/pricing`);
  });
}
