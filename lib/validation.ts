import { z } from 'zod';
// Task: every request body is parsed here, before any SQL or MongoDB call.
// zod rejects wrong types, missing fields and out-of-range values and trims normalises text, so a
// malformed request never reaches the database. The database still enforces its own CHECK and
// trigger rules underneath: the two layers agree, and neither one trusts the other.

// Required, trimmed text with an optional maximum length.
const text = (max = 100) => z.string().trim().min(1).max(max);
export const id = z.coerce.number().int().positive().max(2147483647);
// Optional text: an empty string from a blank form field is stored as NULL, not ''.
const optionalText = (max: number) => z.string().trim().max(max).optional().transform(v => v || null);
// Optional e-mail: same idea, but the value must still look like an e-mail when supplied.
const email = z.union([z.email().max(160), z.literal('')]).optional().transform(v => v || null);
// Timestamps cross the API as ISO strings with an offset and are written as UTC DATETIME(3).
const instant = z.iso.datetime({ offset: true });
export const loginInput = z.object({ username: text(50).transform(v => v.toLowerCase()), password: z.string().min(1).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long') });
export const donorInput = z.object({ name: text(), dob: z.iso.date(), gender: optionalText(30),
  weight_kg: z.coerce.number().positive().max(9999).optional(), phone: optionalText(30), email,
  address: optionalText(500), blood_group_id: id });
export const donationInput = z.object({ donor_id: id, storage_id: id,
  quantity_ml: z.coerce.number().positive().max(99999), expires_at: instant });
export const screeningInput = z.object({ submission_id: z.uuid(), form_version: z.literal('v1'),
  decision: z.enum(['APPROVED', 'REJECTED']),
  answers: z.object({ identity_confirmed: z.boolean(), consent_recorded: z.boolean(),
    review_note: text(1000), follow_up: z.object({ reason: text(300) }).optional() }) });
export const testInput = z.object({ test_type: z.enum(['SCREENING_PANEL', 'ADDITIONAL_REVIEW']), result: z.enum(['PASS', 'FAIL']) });
export const requestInput = z.object({ hospital_id: id, blood_group_id: id,
  requested_units: z.coerce.number().int().positive().max(1000), priority: z.enum(['NORMAL', 'URGENT']), required_at: instant });
export const issueInput = z.object({ units: z.coerce.number().int().positive().max(1000), operation_key: z.uuid() });
export const storageInput = z.object({ location_name: text(), storage_type: text(50),
  temperature_c: z.coerce.number().min(-999).max(999), capacity_units: z.coerce.number().int().positive().max(100000) });
export const hospitalInput = z.object({ hospital_name: text(120), location: text(500), phone: optionalText(30), email });
export const staffInput = z.object({ name: text(), username: text(50).regex(/^[a-z0-9._-]+$/),
  email: z.email().max(160), phone: optionalText(30), role: z.enum(['ADMIN', 'STAFF']),
  password: z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes') });
