import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const isoTimestampSchema = z.string().datetime({ offset: true });

export const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), 'URL must use HTTPS');

export const nonEmptyTrimmedTextSchema = z.string().trim().min(1);

