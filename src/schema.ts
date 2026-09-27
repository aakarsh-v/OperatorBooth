import { z } from 'zod';
import { MAX_NOTICE_LENGTH, MAX_BULK_NOTICES } from './config';

// Check 9: Parsed output schema for Indian Railways delay notice
export const ParsedNoticeSchema = z.object({
  trainNumber: z
    .string()
    .regex(/^\d{5}$/, 'Train number must be a 5-digit numeric string'),
  stationCode: z
    .string()
    .min(2, 'Station code must be at least 2 letters')
    .max(5, 'Station code must be at most 5 letters')
    .regex(/^[A-Z]{2,5}$/, 'Station code must consist of uppercase alphabetic characters'),
  expectedTime: z
    .string()
    .regex(/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/, 'Expected time must be in HH:MM 24-hour format'),
  reason: z.string().nullable().optional(),
});

export type ParsedNotice = z.infer<typeof ParsedNoticeSchema>;

// Input Request Schemas
export const SingleNoticeRequestSchema = z.object({
  notice: z
    .string()
    .min(1, 'Notice text cannot be empty')
    .max(MAX_NOTICE_LENGTH, `Notice text exceeds maximum server size limit of ${MAX_NOTICE_LENGTH} characters`),
});

export const BulkNoticeRequestSchema = z.object({
  notices: z
    .array(
      z
        .string()
        .min(1, 'Notice text cannot be empty')
        .max(MAX_NOTICE_LENGTH, `Notice text exceeds maximum server size limit of ${MAX_NOTICE_LENGTH} characters`)
    )
    .min(1, 'Bulk notices array must contain at least 1 notice')
    .max(MAX_BULK_NOTICES, `Bulk request cannot exceed ${MAX_BULK_NOTICES} notices`),
});
