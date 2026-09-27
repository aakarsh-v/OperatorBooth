import { describe, it, expect } from 'vitest';
import { parseDelayNotice, NoticeParseError } from '../src/parser';
import { ParsedNoticeSchema } from '../src/schema';

describe('Meera Railway Delay Notice Parser', () => {
  describe('Valid Notices (Well-Formed)', () => {
    it('should parse English delay notice correctly', () => {
      const input = 'Train 12128 (INTERCITY EXP) at PUNE. Expected arrival updated to 14:30. Reason: Signal failure near Lonavala.';
      const result = parseDelayNotice(input);

      expect(result.trainNumber).toBe('12128');
      expect(result.stationCode).toBe('PUNE');
      expect(result.expectedTime).toBe('14:30');
      expect(result.reason).toBe('Signal failure near Lonavala.');

      // Check 9: Parsed output validated against declared Zod schema
      expect(() => ParsedNoticeSchema.parse(result)).not.toThrow();
    });

    it('should parse Hindi delay notice correctly', () => {
      const input = 'गाड़ी संख्या 11014 (CSTM EXPRESS) स्टेशन PUNE. नया समय 18:45. कारण: तकनीकी खराबी';
      const result = parseDelayNotice(input);

      expect(result.trainNumber).toBe('11014');
      expect(result.stationCode).toBe('PUNE');
      expect(result.expectedTime).toBe('18:45');
      expect(result.reason).toBe('तकनीकी खराबी');
      expect(() => ParsedNoticeSchema.parse(result)).not.toThrow();
    });

    it('should parse Marathi delay notice correctly', () => {
      const input = 'ट्रेन 12124 DECCAN QUEEN, स्टेशन PWI. नवीन वेळ 10:15. कारण: रुळांची दुरुस्ती';
      const result = parseDelayNotice(input);

      expect(result.trainNumber).toBe('12124');
      expect(result.stationCode).toBe('PWI');
      expect(result.expectedTime).toBe('10:15');
      expect(result.reason).toBe('रुळांची दुरुस्ती');
      expect(() => ParsedNoticeSchema.parse(result)).not.toThrow();
    });

    it('should parse short format delay notice', () => {
      const input = '11008 PUNE 09:15 Heavy rains near Khandala';
      const result = parseDelayNotice(input);

      expect(result.trainNumber).toBe('11008');
      expect(result.stationCode).toBe('PUNE');
      expect(result.expectedTime).toBe('09:15');
      expect(result.reason).toContain('Heavy rains');
      expect(() => ParsedNoticeSchema.parse(result)).not.toThrow();
    });
  });

  describe('Malformed Notices (Check 10 Test Cases)', () => {
    it('should throw NoticeParseError when train number is missing', () => {
      const malformed = 'Arriving late at PUNE station expected at 16:00 due to overhead wire breakdown.';
      expect(() => parseDelayNotice(malformed)).toThrow(NoticeParseError);
    });

    it('should throw NoticeParseError on garbage text notice', () => {
      const malformed = 'Notice #9999: System maintenance in progress. No further details available.';
      expect(() => parseDelayNotice(malformed)).toThrow(NoticeParseError);
    });

    it('should throw NoticeParseError when expected time is invalid (e.g. 25:99)', () => {
      const malformed = 'Train 12128 at PUNE expected at 25:99. Reason: Track work.';
      expect(() => parseDelayNotice(malformed)).toThrow(NoticeParseError);
    });

    it('should throw NoticeParseError when input exceeds maximum size limit (Check 8)', () => {
      const tooLongNotice = '12128 PUNE 14:30 ' + 'A'.repeat(2005);
      expect(() => parseDelayNotice(tooLongNotice)).toThrow(NoticeParseError);
    });

    it('should throw NoticeParseError on empty or whitespace string', () => {
      expect(() => parseDelayNotice('')).toThrow(NoticeParseError);
      expect(() => parseDelayNotice('   ')).toThrow(NoticeParseError);
    });
  });
});
