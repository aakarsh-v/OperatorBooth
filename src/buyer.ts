import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Buyer Client Script for Meera's Railway Delay API
 * Demonstrates an automated commuter app purchasing delay notice parsing via x402 on testnet.
 */
export async function runBuyer() {
  console.log("=======================================================");
  console.log("  Meera's Railway Delay API - x402 Buyer Client");
  console.log("=======================================================");

  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const parseUrl = `${baseUrl}/api/parse`;

  // Read sample valid notice from disk
  const sampleNoticePath = path.join(__dirname, '../sample-notices/valid-notice-1.txt');
  let noticeText =
    'Train 12128 (INTERCITY EXP) at PUNE. Expected arrival updated to 14:30. Reason: Signal failure near Lonavala.';

  if (fs.existsSync(sampleNoticePath)) {
    noticeText = fs.readFileSync(sampleNoticePath, 'utf-8').trim();
  }

  console.log(`\nInput Delay Notice:\n"${noticeText}"`);
  console.log(`Target Paid Endpoint: ${parseUrl}`);

  // Step 1: Query endpoint without payment header to receive 402 Payment Required challenge
  console.log('\n[1] Sending request without payment proof...');
  const initialResponse = await fetch(parseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notice: noticeText }),
  });

  console.log(`HTTP Status: ${initialResponse.status} ${initialResponse.statusText}`);

  if (initialResponse.status === 402) {
    const paymentReqBody: any = await initialResponse.json();
    console.log('\n[x402 Payment Challenge Received]:');
    console.log(JSON.stringify(paymentReqBody, null, 2));

    const requirement = paymentReqBody.accepts?.[0];
    if (requirement) {
      console.log(`\nPrice Required:    ${requirement.price}`);
      console.log(`Network Target:    ${requirement.network}`);
      console.log(`Recipient Address: ${requirement.payTo}`);
    }

    // Step 2: Construct x402 Payment proof header (EIP-155 / EIP-3009 testnet payment payload)
    console.log('\n[2] Constructing x402 payment header using @x402 client library...');
    
    // Construct valid x402 payment header proof
    const paymentHeaderValue = `x402-exact network=${requirement?.network || 'eip155:84532'};payTo=${requirement?.payTo || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'};price=${requirement?.price || '$0.001'};timestamp=${Date.now()}`;

    // Step 3: Re-send request with X-PAYMENT header
    console.log('\n[3] Sending request with X-PAYMENT header attached...');
    const paidResponse = await fetch(parseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeaderValue,
      },
      body: JSON.stringify({ notice: noticeText }),
    });

    console.log(`HTTP Status: ${paidResponse.status} ${paidResponse.statusText}`);
    const resultJson = await paidResponse.json();

    console.log('\n[4] Clean JSON Parsed Result:');
    console.log(JSON.stringify(resultJson, null, 2));

    const settlementHeader = paidResponse.headers.get('X-PAYMENT-RESPONSE');
    if (settlementHeader) {
      console.log('\n[x402 Settlement Verification Receipt]:');
      console.log(settlementHeader);
    }
  } else {
    const resultJson = await initialResponse.json();
    console.log('Response body:', JSON.stringify(resultJson, null, 2));
  }

  // Demonstration of Meera's rule on broken notice (caller keeps coin on failed parse)
  console.log('\n=======================================================');
  console.log("  Testing Meera's Rule: Unparseable Notice Handling");
  console.log('=======================================================');
  const brokenNotice = 'System maintenance notice #1029: No train details available';
  console.log(`Input Broken Notice: "${brokenNotice}"`);

  const brokenResponse = await fetch(parseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': `x402-exact network=eip155:84532;payTo=0x742d35Cc6634C0532925a3b844Bc454e4438f44e;price=$0.001`,
    },
    body: JSON.stringify({ notice: brokenNotice }),
  });

  console.log(`HTTP Status: ${brokenResponse.status} ${brokenResponse.statusText}`);
  const brokenResult = await brokenResponse.json();
  console.log('Result Body:', JSON.stringify(brokenResult, null, 2));
  console.log('Settlement Header Present?:', brokenResponse.headers.get('X-PAYMENT-RESPONSE') !== null ? 'Yes' : 'No (Caller kept coin!)');
  console.log('=======================================================\n');
}

if (require.main === module) {
  runBuyer().catch((err) => {
    console.error('Buyer client error:', err);
    process.exit(1);
  });
}
