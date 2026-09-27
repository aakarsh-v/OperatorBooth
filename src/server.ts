import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import {
  NETWORK,
  PAYEE_ADDRESS,
  USDC_ASSET_ADDRESS,
  PRICE_SINGLE_PARSE,
  PRICE_BULK_PARSE,
  MAX_NOTICE_LENGTH,
  MAX_BULK_NOTICES,
} from './config';
import {
  SingleNoticeRequestSchema,
  BulkNoticeRequestSchema,
  ParsedNoticeSchema,
} from './schema';
import { parseDelayNotice, NoticeParseError } from './parser';
import { createX402Middleware, x402RoutesConfig } from './middleware/x402';

export function createServer() {
  const app = express();

  // Check 8: Enforce server-side request body size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.text({ limit: '10kb' }));
  app.use(express.urlencoded({ limit: '10kb', extended: true }));

  // Check 8: Explicit middleware for checking content-length header
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 10240) {
      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Request body exceeds maximum server size limit of 10KB',
      });
    }
    next();
  });

  // CORS headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-PAYMENT, Payment-Signature, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Check 1, 2, 5, 6: Attach x402 payment middleware to gate paid routes
  app.use(createX402Middleware());

  // ----------------------------------------------------
  // FREE ROUTES (At least one free route as required)
  // ----------------------------------------------------

  /**
   * GET /
   * API Overview & specs
   */
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: "Meera's Railway Delay API",
      description: 'Micro-pay per call Indian Railways delay notice parser powered by x402',
      operator: 'Meera (Pune, India)',
      pricingRule: 'No charge for unparseable or broken notices. If parser fails, caller keeps coin.',
      network: NETWORK,
      payTo: PAYEE_ADDRESS,
      asset: USDC_ASSET_ADDRESS,
      routes: {
        free: [
          { path: '/', method: 'GET', description: 'API Info & Documentation' },
          { path: '/health', method: 'GET', description: 'Health check' },
          { path: '/api/sample-notices', method: 'GET', description: 'List sample delay notices' },
          { path: '/api/free-demo', method: 'POST', description: 'Free single notice parse preview' },
        ],
        paid: [
          {
            path: '/api/parse',
            method: 'POST',
            price: PRICE_SINGLE_PARSE,
            description: 'Parse single raw delay notice into clean JSON',
          },
          {
            path: '/api/bulk-parse',
            method: 'POST',
            price: PRICE_BULK_PARSE,
            description: 'Bulk parse up to 10 delay notices into clean JSON array',
          },
        ],
      },
    });
  });

  /**
   * GET /health
   * Health check endpoint
   */
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Meera Railway Delay API',
      timestamp: new Date().toISOString(),
      network: NETWORK,
    });
  });

  /**
   * GET /api/sample-notices
   * Return sample delay notices (well-formed & broken)
   */
  app.get('/api/sample-notices', (req: Request, res: Response) => {
    const samplesDir = path.join(__dirname, '../sample-notices');
    try {
      if (!fs.existsSync(samplesDir)) {
        return res.json({ samples: [] });
      }
      const files = fs.readdirSync(samplesDir);
      const samples = files.map((file) => {
        const content = fs.readFileSync(path.join(samplesDir, file), 'utf-8').trim();
        return {
          filename: file,
          isWellFormed: file.startsWith('valid-'),
          content,
        };
      });
      res.json({ count: samples.length, samples });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to read sample notices', details: err.message });
    }
  });

  /**
   * POST /api/free-demo
   * Free single notice parse demo (no x402 charge)
   */
  app.post('/api/free-demo', (req: Request, res: Response) => {
    const parseReq = SingleNoticeRequestSchema.safeParse(req.body);
    if (!parseReq.success) {
      return res.status(400).json({
        error: 'Invalid Request Input',
        details: parseReq.error.issues,
      });
    }

    try {
      const parsed = parseDelayNotice(parseReq.data.notice);
      return res.json({
        success: true,
        mode: 'free-demo',
        data: parsed,
      });
    } catch (err: any) {
      const status = err instanceof NoticeParseError ? err.statusCode : 400;
      return res.status(status).json({
        error: 'Unparseable Notice',
        message: err.message,
      });
    }
  });

  // ----------------------------------------------------
  // PAID ROUTES (Gated by x402 Payment)
  // ----------------------------------------------------

  /**
   * POST /api/parse
   * Single notice parse ($0.001)
   */
  app.post('/api/parse', (req: Request, res: Response) => {
    // Validate request input payload
    const validation = SingleNoticeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      // Check 7: Return HTTP 400 on invalid input payload
      return res.status(400).json({
        error: 'Invalid Request Input',
        message: 'Request body must contain a valid "notice" string',
        details: validation.error.issues,
      });
    }

    const { notice } = validation.data;

    // Check 8: Enforce maximum notice length cap
    if (notice.length > MAX_NOTICE_LENGTH) {
      return res.status(400).json({
        error: 'Notice Exceeds Length Limit',
        message: `Notice length (${notice.length}) exceeds maximum allowed length of ${MAX_NOTICE_LENGTH} characters`,
      });
    }

    try {
      // Parse & Validate notice output against declared Zod schema (Check 9)
      const parsedData = parseDelayNotice(notice);

      // Check 9: Double-check output schema validation
      const validatedOutput = ParsedNoticeSchema.parse(parsedData);

      return res.status(200).json({
        success: true,
        data: validatedOutput,
      });
    } catch (err: any) {
      // Check 7: If parsing fails, respond with HTTP 4xx status (400)
      // Note: Because status is 400, x402 settlement is SKIPPED and caller keeps coin!
      const statusCode = err instanceof NoticeParseError ? err.statusCode : 400;
      return res.status(statusCode).json({
        error: 'Unparseable Notice',
        message: err.message || 'The provided delay notice could not be parsed',
      });
    }
  });

  /**
   * POST /api/bulk-parse
   * Bulk notice parse ($0.005)
   */
  app.post('/api/bulk-parse', (req: Request, res: Response) => {
    // Validate bulk request input payload
    const validation = BulkNoticeRequestSchema.safeParse(req.body);
    if (!validation.success) {
      // Check 7: Return HTTP 400 on invalid payload
      return res.status(400).json({
        error: 'Invalid Bulk Request Input',
        message: `Request body must contain a "notices" array of up to ${MAX_BULK_NOTICES} strings`,
        details: validation.error.issues,
      });
    }

    const { notices } = validation.data;

    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < notices.length; i++) {
      const noticeText = notices[i];

      // Check 8: Notice length check per notice
      if (noticeText.length > MAX_NOTICE_LENGTH) {
        errors.push({
          index: i,
          error: `Notice at index ${i} exceeds maximum length of ${MAX_NOTICE_LENGTH} characters`,
        });
        continue;
      }

      try {
        const parsed = parseDelayNotice(noticeText);
        // Check 9: Validate output schema
        const validated = ParsedNoticeSchema.parse(parsed);
        results.push(validated);
      } catch (err: any) {
        errors.push({
          index: i,
          error: err.message || 'Unparseable notice',
        });
      }
    }

    // Check 7: If all notices in bulk request failed to parse, return 400 Bad Request
    if (results.length === 0 && errors.length > 0) {
      return res.status(400).json({
        error: 'All Bulk Notices Unparseable',
        message: 'None of the notices provided in bulk request could be parsed',
        failures: errors,
      });
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results,
      partialFailures: errors.length > 0 ? errors : undefined,
    });
  });

  // Fallback 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} does not exist` });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large' || err.statusCode === 413) {
      return res.status(413).json({
        error: 'Payload Too Large',
        message: 'Request body exceeds maximum server size limit',
      });
    }
    console.error('Unhandled Server Error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    });
  });

  return app;
}
