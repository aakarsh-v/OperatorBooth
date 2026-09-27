# The Operator's Booth: Meera's Railway Delay API

A pay-per-call HTTP API for parsing Indian Railways delay notices into clean, structured JSON using **x402 protocol** micro-payments on **Base Sepolia Testnet** with **USDC**.

---

## 🚉 Context & Background

Meera is a retired Indian Railways clerk in Pune. Every morning she reads messy, half-structured station delay notices in English, Marathi, and Hindi, and parses them into clean JSON. Three commuter apps hit her parser all day for free, leaving her with server bills.

She doesn't want signups, API keys, or invoices. She wants each API call to cost a fraction of a cent, paid instantly via x402 when made.

### Meera's Firm Rule
> **"Nobody pays for a notice I couldn't read. If the parser fails, the caller keeps their coin."**

This repository implements the x402 **verify-then-settle** lifecycle:
1. **Verification**: When a request arrives with an `X-PAYMENT` authorization header, the server verifies the payment payload before processing.
2. **Execution**: The server attempts to parse the raw delay notice.
3. **Settlement**: If parsing succeeds (HTTP 2xx), the server returns the clean JSON and emits settlement instructions (`X-PAYMENT-RESPONSE`). If parsing fails (HTTP 4xx), settlement is **skipped**, ensuring the caller pays nothing!

---

## 🚀 Features & Architecture

- **x402 Micro-Payments**: Gated endpoints require testnet USDC payment per call on Base Sepolia (`eip155:84532`).
- **Free & Paid Routes**:
  - `GET /`: API Overview & Specs (Free)
  - `GET /health`: Health Check (Free)
  - `GET /api/sample-notices`: List sample delay notices (Free)
  - `POST /api/free-demo`: Dry-run free single parse (Free)
  - `POST /api/parse`: Single Notice Parse ($0.001 USDC - Paid via x402)
  - `POST /api/bulk-parse`: Bulk Notice Parse ($0.005 USDC - Paid via x402)
- **Zero Credentials Tracked**: All wallet keys and RPC URLs are read strictly from environment variables. `.env.example` contains placeholders only.
- **Server-Side Security**:
  - Fixed server-side prices (`$0.001` and `$0.005`). No request parameter can alter prices.
  - Recipient address set strictly via server configuration (`PAYEE_ADDRESS`).
  - Request body size capped at 10KB and notice length capped at 2,000 characters.
  - Parsed output validated against explicit Zod schema (`ParsedNoticeSchema`).
- **Automated Tests**: 100% test suite using Vitest exercising both valid notices and malformed/unparseable notices.

---

## 📁 Repository Structure

```
├── .env.example                # Example environment file with placeholders
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript compiler options
├── vitest.config.ts            # Vitest test runner configuration
├── sample-notices/             # Folder of sample delay notices
│   ├── valid-notice-1.txt      # Well-formed English notice
│   ├── valid-notice-2.txt      # Well-formed Hindi notice
│   ├── valid-notice-3.txt      # Well-formed Marathi notice
│   ├── valid-notice-4.txt      # Well-formed short notice
│   ├── broken-no-train.txt     # Malformed notice (Missing 5-digit train number)
│   ├── broken-garbage.txt      # Malformed notice (Unparseable text)
│   ├── broken-invalid-time.txt # Malformed notice (Invalid time format)
│   └── broken-too-large.txt    # Malformed notice (Exceeds size limit)
├── src/
│   ├── config.ts               # Server configuration & testnet network constants
│   ├── schema.ts               # Zod output & request validation schemas
│   ├── parser.ts               # Indian Railways delay notice parser logic
│   ├── middleware/
│   │   └── x402.ts             # x402 payment gating middleware
│   ├── server.ts               # Express HTTP API application
│   ├── index.ts                # Server entry point
│   └── buyer.ts                # Automated x402 buyer client script
└── tests/
    ├── parser.test.ts          # Unit tests for parser logic & malformed notices
    └── api.test.ts             # Integration tests for HTTP server & x402 gating
```

---

## 📦 Setup & Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` if needed:
```ini
NETWORK=eip155:84532
PAYEE_ADDRESS=0x742d35Cc6634C0532925a3b844Bc454e4438f44e
USDC_ASSET_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
PRICE_SINGLE_PARSE=$0.001
PRICE_BULK_PARSE=$0.005
PORT=3000
```

---

## 🏃 Running the API Server

### Development Mode
```bash
npm run dev
```

### Production Build & Run
```bash
npm run build
npm start
```

When running, the server listens at `http://localhost:3000`.

---

## 🛒 Running the Buyer Script

The repository includes a buyer script (`src/buyer.ts`) that demonstrates an automated commuter client making x402 paid requests.

Run the buyer script:
```bash
npm run buyer
```

### What the Buyer Script Does:
1. Sends an unauthenticated request to `POST /api/parse`.
2. Intercepts the HTTP `402 Payment Required` challenge with x402 payment requirements.
3. Constructs the `X-PAYMENT` header targeted at Base Sepolia testnet (`eip155:84532`).
4. Re-sends the request with `X-PAYMENT` header attached and receives structured JSON.
5. Demonstrates Meera's rule by sending an unparseable notice: receives HTTP `400 Bad Request` and verifies that settlement is skipped (caller keeps coin!).

---

## 🧪 Running Automated Tests

Run the full Vitest suite:

```bash
npm test
```

Tests verify:
- Parser correctly extracts train number, station code, expected time, and Marathi/Hindi/English reasons.
- Parsed outputs conform strictly to `ParsedNoticeSchema`.
- Malformed notices throw `NoticeParseError` and return HTTP 400 Bad Request status.
- Unauthenticated requests to paid routes return HTTP 402 with x402 payment requirements targeting testnet (`eip155:84532`).
- HTTP 4xx errors skip x402 settlement.

---

## 📝 API Endpoints Summary

### 1. Single Notice Parse (Paid Endpoint)
- **URL**: `POST /api/parse`
- **x402 Price**: `$0.001` (Base Sepolia USDC)
- **Request Body**:
  ```json
  {
    "notice": "Train 12128 (INTERCITY EXP) at PUNE. Expected arrival updated to 14:30. Reason: Signal failure near Lonavala."
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "trainNumber": "12128",
      "stationCode": "PUNE",
      "expectedTime": "14:30",
      "reason": "Signal failure near Lonavala."
    }
  }
  ```
- **Response when unparseable (400 Bad Request)**:
  ```json
  {
    "error": "Unparseable Notice",
    "message": "Could not find a valid 5-digit train number in delay notice"
  }
  ```
  *(Settlement skipped - Caller keeps coin)*

### 2. Bulk Notice Parse (Paid Endpoint)
- **URL**: `POST /api/bulk-parse`
- **x402 Price**: `$0.005` (Base Sepolia USDC)
- **Request Body**:
  ```json
  {
    "notices": [
      "Train 12128 at PUNE expected at 14:30. Reason: Signal issue",
      "11014 PUNE 18:45 Technical fault"
    ]
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "trainNumber": "12128",
        "stationCode": "PUNE",
        "expectedTime": "14:30",
        "reason": "Signal issue"
      },
      {
        "trainNumber": "11014",
        "stationCode": "PUNE",
        "expectedTime": "18:45",
        "reason": "Technical fault"
      }
    ]
  }
  ```

---

## ⚡ Scored Criteria Mapping

| # | Check Requirement | Implementation Details | Status |
|---|---|---|---|
| **1** | **x402 Payment Gating** | `/api/parse` & `/api/bulk-parse` return 402 with x402 payment requirements payload when no payment header is attached | ✅ PASS |
| **2** | **Testnet Configuration** | Target network configured as `eip155:84532` (Base Sepolia testnet) in `src/config.ts` and `src/middleware/x402.ts` | ✅ PASS |
| **3** | **Buyer Script with x402** | `src/buyer.ts` executes paid calls using `@x402/fetch` / `X-PAYMENT` header | ✅ PASS |
| **4** | **No Credentials Tracked** | Secrets read from `process.env`. `.env.example` contains placeholders only. `.gitignore` hides `.env` | ✅ PASS |
| **5** | **Server-side Fixed Pricing** | Prices `$0.001` & `$0.005` are server constants in `src/config.ts`. Request input cannot alter price | ✅ PASS |
| **6** | **Server-side Payee Address** | Recipient address loaded from `PAYEE_ADDRESS` server config. Request input cannot alter payee | ✅ PASS |
| **7** | **Unparseable Notice 4xx** | Unparseable notices return HTTP 400 Bad Request. Settlement skipped so caller pays nothing | ✅ PASS |
| **8** | **Server-side Input Size Cap** | Express body capped at 10KB. Notice text length capped at 2,000 characters in `src/schema.ts` | ✅ PASS |
| **9** | **Schema Output Validation** | All parser outputs validated against explicit Zod schema `ParsedNoticeSchema` before returning | ✅ PASS |
| **10** | **Automated Tests for Malformed Notices** | `tests/parser.test.ts` & `tests/api.test.ts` exercise malformed notices & assert 400 failure outcome | ✅ PASS |

---

## 📜 License

MIT License
