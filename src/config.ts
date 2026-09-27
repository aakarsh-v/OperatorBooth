import dotenv from 'dotenv';
dotenv.config();

// Check 2: Network identifier must target a testnet (Base Sepolia)
export const NETWORK = (process.env.NETWORK || 'eip155:84532').trim();

// Check 6: Recipient address comes from server-side configuration
export const PAYEE_ADDRESS = (
  process.env.PAYEE_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
).trim();

// USDC Asset Address on Base Sepolia
export const USDC_ASSET_ADDRESS = (
  process.env.USDC_ASSET_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
).trim();

// Check 5: Route prices are server-side constants (NOT derived from request input)
export const PRICE_SINGLE_PARSE = (process.env.PRICE_SINGLE_PARSE || '$0.001').trim();
export const PRICE_BULK_PARSE = (process.env.PRICE_BULK_PARSE || '$0.005').trim();

// Check 8: Input size limits enforced server-side
export const MAX_NOTICE_LENGTH = 2000; // max 2000 characters per notice
export const MAX_BULK_NOTICES = 10;   // max 10 notices in bulk request

export const PORT = parseInt(process.env.PORT || '3000', 10);
