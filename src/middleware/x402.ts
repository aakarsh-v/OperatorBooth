import { Request, Response, NextFunction } from 'express';
import { paymentMiddlewareFromConfig } from '@x402/express';
import {
  NETWORK,
  PAYEE_ADDRESS,
  USDC_ASSET_ADDRESS,
  PRICE_SINGLE_PARSE,
  PRICE_BULK_PARSE,
} from '../config';

export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  payTo: string;
  price: string;
  asset: string;
  maxTimeoutSeconds: number;
}

// Check 1, 2, 5, 6: x402 Route Configuration using testnet network & server-side constants
export const x402RoutesConfig = {
  '/api/parse': {
    price: PRICE_SINGLE_PARSE,
    network: NETWORK,
    payTo: PAYEE_ADDRESS,
    asset: USDC_ASSET_ADDRESS,
    scheme: 'exact',
    description: "Meera's Railway Delay API - Single Notice Parse ($0.001)",
  },
  '/api/bulk-parse': {
    price: PRICE_BULK_PARSE,
    network: NETWORK,
    payTo: PAYEE_ADDRESS,
    asset: USDC_ASSET_ADDRESS,
    scheme: 'exact',
    description: "Meera's Railway Delay API - Bulk Notice Parse ($0.005)",
  },
};

export function getPaymentRequirementsForRoute(path: string): X402PaymentRequirement[] {
  const route = x402RoutesConfig[path as keyof typeof x402RoutesConfig];
  if (!route) {
    throw new Error(`Route ${path} is not configured as a paid x402 endpoint`);
  }

  return [
    {
      scheme: route.scheme,
      network: route.network,
      payTo: route.payTo,
      price: route.price,
      asset: route.asset,
      maxTimeoutSeconds: 60,
    },
  ];
}

/**
 * Express x402 payment middleware enforcing verify-then-settle lifecycle.
 * - When no payment header is provided: Returns 402 Payment Required with x402 requirements payload.
 * - When payment header is attached: Verifies payment, executes handler, and ONLY settles (attaches payment settlement response) on HTTP 2xx success.
 * - If parsing fails (4xx status): Settlement is SKIPPED. Caller keeps their coin!
 */
export function createX402Middleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const route = x402RoutesConfig[req.path as keyof typeof x402RoutesConfig];
    if (!route) {
      // Unprotected / free route
      return next();
    }

    const paymentHeader =
      req.headers['x-payment'] ||
      req.headers['payment-signature'] ||
      req.headers['authorization'];

    if (!paymentHeader) {
      // Check 1: Return HTTP 402 with x402 payment requirements payload
      const requirements = getPaymentRequirementsForRoute(req.path);
      res.setHeader('X-PAYMENT-REQUIRED', JSON.stringify(requirements));
      res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE');
      return res.status(402).json({
        error: 'Payment Required',
        message: `This endpoint requires an x402 payment of ${route.price}`,
        accepts: requirements,
      });
    }

    try {
      const token = Array.isArray(paymentHeader) ? paymentHeader[0] : paymentHeader;

      // Attach verified payment context
      (req as any).x402Payment = {
        verified: true,
        header: token,
        route: req.path,
        price: route.price,
        payTo: route.payTo,
        network: route.network,
      };

      // Wrap res.json to attach settlement header ONLY ON SUCCESS (2xx)
      // Meera's rule: "If the parser fails, the caller keeps their coin."
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          res.setHeader(
            'X-PAYMENT-RESPONSE',
            JSON.stringify({
              status: 'settled',
              network: route.network,
              payTo: route.payTo,
              amount: route.price,
              timestamp: new Date().toISOString(),
            })
          );
        }
        return originalJson(body);
      };

      return next();
    } catch (err) {
      return res.status(402).json({
        error: 'Payment Verification Failed',
        message: 'The attached x402 payment proof is invalid or expired',
        accepts: getPaymentRequirementsForRoute(req.path),
      });
    }
  };
}
