import { createServer } from './server';
import { PORT, NETWORK, PAYEE_ADDRESS, PRICE_SINGLE_PARSE, PRICE_BULK_PARSE } from './config';

const app = createServer();

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Meera's Railway Delay API Server Running on Port ${PORT}`);
  console.log(`=======================================================`);
  console.log(`  Network:        ${NETWORK}`);
  console.log(`  Payee Address:  ${PAYEE_ADDRESS}`);
  console.log(`  Single Parse:   ${PRICE_SINGLE_PARSE} (/api/parse)`);
  console.log(`  Bulk Parse:     ${PRICE_BULK_PARSE} (/api/bulk-parse)`);
  console.log(`=======================================================`);
});
