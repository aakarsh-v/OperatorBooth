import { ParsedNoticeSchema, ParsedNotice } from './schema';
import { MAX_NOTICE_LENGTH } from './config';

export class NoticeParseError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'NoticeParseError';
    this.statusCode = statusCode;
  }
}

/**
 * Parses raw messy Indian Railways delay notices (in Marathi, Hindi, English)
 * and returns structured JSON conforming to ParsedNoticeSchema.
 */
export function parseDelayNotice(rawNotice: string): ParsedNotice {
  if (!rawNotice || typeof rawNotice !== 'string') {
    throw new NoticeParseError('Notice content must be a non-empty string', 400);
  }

  // Check 8: Server-side notice length cap check
  if (rawNotice.length > MAX_NOTICE_LENGTH) {
    throw new NoticeParseError(
      `Notice length (${rawNotice.length}) exceeds maximum limit of ${MAX_NOTICE_LENGTH} characters`,
      400
    );
  }

  const cleaned = rawNotice.trim();
  if (cleaned.length === 0) {
    throw new NoticeParseError('Notice content is empty', 400);
  }

  // 1. Extract 5-digit train number
  const trainMatch = cleaned.match(/\b(\d{5})\b/);
  if (!trainMatch) {
    throw new NoticeParseError('Could not find a valid 5-digit train number in delay notice', 400);
  }
  const trainNumber = trainMatch[1];

  // 2. Extract expected time (HH:MM format in 24h)
  const timeMatch = cleaned.match(/\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/);
  if (!timeMatch) {
    throw new NoticeParseError('Could not find a valid time (HH:MM format) in delay notice', 400);
  }
  const hours = timeMatch[1].padStart(2, '0');
  const minutes = timeMatch[2];
  const expectedTime = `${hours}:${minutes}`;

  // 3. Extract station code (2 to 5 uppercase letters, e.g. PUNE, PWI, LNL, CSMT, SUR, DR, PA)
  const commonWords = new Set([
    'TRAIN', 'EXP', 'EXPRESS', 'QUEEN', 'SUPERFAST', 'LOCAL',
    'UPDATED', 'TIME', 'ARRIVING', 'ARRIVED', 'EXPECTED', 'DELAY',
    'DELAYED', 'REASON', 'NOTICE', 'SYSTEM', 'DETAILS'
  ]);

  let stationCode: string | null = null;
  const stationKeywordMatch = cleaned.match(/(?:at|station|स्टेशन)\s+([A-Za-z]{2,5})\b/i);
  if (stationKeywordMatch) {
    const candidate = stationKeywordMatch[1].toUpperCase();
    if (!commonWords.has(candidate)) {
      stationCode = candidate;
    }
  }

  if (!stationCode) {
    const uppercaseMatches = cleaned.match(/\b[A-Z]{2,5}\b/g);
    if (uppercaseMatches) {
      for (const match of uppercaseMatches) {
        if (!commonWords.has(match)) {
          stationCode = match;
          break;
        }
      }
    }
  }

  if (!stationCode) {
    throw new NoticeParseError('Could not identify a valid station code (2-5 uppercase letters) in delay notice', 400);
  }

  // 4. Extract reason if present (English / Marathi / Hindi)
  let reason: string | null = null;
  const reasonKeywordMatch = cleaned.match(/(?:Reason|कारण|कारण\s*[-:])\s*[:|-]?\s*(.+)$/i);
  if (reasonKeywordMatch) {
    reason = reasonKeywordMatch[1].trim();
  } else {
    const timeIndex = cleaned.indexOf(timeMatch[0]);
    if (timeIndex !== -1) {
      const remainingText = cleaned.slice(timeIndex + timeMatch[0].length).replace(/^[.\s,:-]+/, '').trim();
      if (remainingText.length > 0) {
        reason = remainingText;
      }
    }
  }

  const rawParsed = {
    trainNumber,
    stationCode,
    expectedTime,
    reason: reason || null,
  };

  // Check 9: Parsed output MUST be validated against declared Zod schema before being returned
  try {
    return ParsedNoticeSchema.parse(rawParsed);
  } catch (err: any) {
    throw new NoticeParseError(`Parsed notice output failed schema validation: ${err.message}`, 400);
  }
}
