import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server';
import { NETWORK, PAYEE_ADDRESS, PRICE_SINGLE_PARSE, PRICE_BULK_PARSE } from '../src/config';

describe('Meera Railway Delay API HTTP Server Integration Tests', () => {
  const app = createServer();
  const validPaymentHeader = `x402-exact network=${NETWORK};payTo=${PAYEE_ADDRESS};price=${PRICE_SINGLE_PARSE}`;
  const validBulkPaymentHeader = `x402-exact network=${NETWORK};payTo=${PAYEE_ADDRESS};price=${PRICE_BULK_PARSE}`;

  describe('Free Routes', () => {
    it('GET / should return API overview and pricing details', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Meera's Railway Delay API");
      expect(res.body.network).toBe(NETWORK);
      expect(res.body.payTo).toBe(PAYEE_ADDRESS);
    });

    it('GET /health should return 200 ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /api/sample-notices should return sample delay notices', async () => {
      const res = await request(app).get('/api/sample-notices');
      expect(res.status).toBe(200);
      expect(res.body.samples).toBeDefined();
      expect(Array.isArray(res.body.samples)).toBe(true);
    });

    it('POST /api/free-demo should parse notice for free without payment header', async () => {
      const res = await request(app)
        .post('/api/free-demo')
        .send({ notice: 'Train 12128 (INTERCITY EXP) at PUNE. Expected arrival updated to 14:30. Reason: Signal failure near Lonavala.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trainNumber).toBe('12128');
    });
  });

  describe('Paid Routes - x402 Payment Gating (Check 1, 2, 5, 6)', () => {
    it('POST /api/parse without payment header should return HTTP 402 with x402 payment requirements', async () => {
      const res = await request(app)
        .post('/api/parse')
        .send({ notice: 'Train 12128 at PUNE expected at 14:30' });

      // Check 1: Must return 402 status
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Payment Required');
      expect(res.body.accepts).toBeDefined();
      expect(Array.isArray(res.body.accepts)).toBe(true);

      const reqs = res.body.accepts[0];
      // Check 2: Payment network target must be testnet (eip155:84532)
      expect(reqs.network).toBe('eip155:84532');
      // Check 5: Price must be server-side constant ($0.001)
      expect(reqs.price).toBe(PRICE_SINGLE_PARSE);
      // Check 6: payTo address must be server-side constant
      expect(reqs.payTo).toBe(PAYEE_ADDRESS);
    });

    it('POST /api/bulk-parse without payment header should return HTTP 402 with x402 payment requirements', async () => {
      const res = await request(app)
        .post('/api/bulk-parse')
        .send({ notices: ['Train 12128 at PUNE expected at 14:30', '11014 PUNE 18:45'] });

      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Payment Required');
      const reqs = res.body.accepts[0];
      expect(reqs.network).toBe('eip155:84532');
      expect(reqs.price).toBe(PRICE_BULK_PARSE);
      expect(reqs.payTo).toBe(PAYEE_ADDRESS);
    });
  });

  describe('Paid Routes Execution & Error Handling (Check 7, 8, 9, 10)', () => {
    it('POST /api/parse with payment header and well-formed notice should return 200 with validated JSON (Check 9)', async () => {
      const res = await request(app)
        .post('/api/parse')
        .set('X-PAYMENT', validPaymentHeader)
        .send({ notice: 'Train 12128 (INTERCITY EXP) at PUNE. Expected arrival updated to 14:30. Reason: Signal failure near Lonavala.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trainNumber).toBe('12128');
      expect(res.body.data.stationCode).toBe('PUNE');
      expect(res.body.data.expectedTime).toBe('14:30');
      expect(res.body.data.reason).toBe('Signal failure near Lonavala.');

      // Check settlement header attached on HTTP 2xx success
      expect(res.headers['x-payment-response']).toBeDefined();
    });

    it('POST /api/parse with malformed notice should return HTTP 400 status and NO settlement header (Check 7, 10)', async () => {
      const res = await request(app)
        .post('/api/parse')
        .set('X-PAYMENT', validPaymentHeader)
        .send({ notice: 'Arriving late at PUNE station expected at 16:00 due to breakdown.' }); // Missing train number

      // Check 7: Must respond with 4xx status (400)
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unparseable Notice');
      expect(res.body.message).toBeDefined();

      // Check 7 & Meera's Rule: Caller keeps coin! Settlement header is NOT set on failure.
      expect(res.headers['x-payment-response']).toBeUndefined();
    });

    it('POST /api/parse with garbage notice text should return HTTP 400 status (Check 7, 10)', async () => {
      const res = await request(app)
        .post('/api/parse')
        .set('X-PAYMENT', validPaymentHeader)
        .send({ notice: 'Notice #9999: System maintenance in progress. No further details available.' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unparseable Notice');
    });

    it('POST /api/parse with notice exceeding maximum length limit should return 400 (Check 8)', async () => {
      const longNotice = '12128 PUNE 14:30 ' + 'X'.repeat(2005);
      const res = await request(app)
        .post('/api/parse')
        .set('X-PAYMENT', validPaymentHeader)
        .send({ notice: longNotice });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('POST /api/bulk-parse with payment header and valid notices should parse all notices', async () => {
      const res = await request(app)
        .post('/api/bulk-parse')
        .set('X-PAYMENT', validBulkPaymentHeader)
        .send({
          notices: [
            'Train 12128 at PUNE expected at 14:30. Reason: Signal issue',
            '11014 PUNE 18:45 Technical fault',
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].trainNumber).toBe('12128');
      expect(res.body.data[1].trainNumber).toBe('11014');
    });
  });
});
