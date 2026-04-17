import { z } from 'zod';

// ─── Shared field validators ───────────────────────────────────────────────

const hebrewOrLatinName = z
  .string()
  .min(2, 'השם חייב להכיל לפחות 2 תווים')
  .max(100, 'השם ארוך מדי')
  .regex(
    /^[\u0590-\u05FFa-zA-Z\s'"\-]+$/,
    'השם יכול להכיל אותיות בעברית, אנגלית, רווחים ומקפים בלבד'
  );

const israeliPhoneNumber = z
  .string()
  .min(9, 'מספר הטלפון קצר מדי')
  .max(15, 'מספר הטלפון ארוך מדי')
  .regex(
    /^(\+972|0)([-\s]?)(5[0-9]|[23489])([-\s]?)(\d{7})$/,
    'אנא הזן מספר טלפון ישראלי תקין (למשל: 050-1234567 או +972501234567)'
  );

const emailAddress = z
  .string()
  .email('כתובת האימייל אינה תקינה')
  .max(254, 'כתובת האימייל ארוכה מדי');

// ─── Practice area subject enum ────────────────────────────────────────────

export const PracticeAreaSubject = z.enum([
  'real_estate',
  'family_law',
  'labor_law',
  'commercial_litigation',
  'corporate',
  'criminal_defense',
  'administrative_law',
  'other',
]);

export type PracticeAreaSubjectType = z.infer<typeof PracticeAreaSubject>;

export const PRACTICE_AREA_LABELS: Record<PracticeAreaSubjectType, string> = {
  real_estate: 'נדל"ן',
  family_law: 'דיני משפחה',
  labor_law: 'דיני עבודה',
  commercial_litigation: 'ליטיגציה מסחרית',
  corporate: 'דיני חברות',
  criminal_defense: 'הגנה פלילית',
  administrative_law: 'משפט מינהלי',
  other: 'אחר',
};

// ─── Lead / Consultation Request Schema ────────────────────────────────────

export const LeadSchema = z.object({
  full_name: hebrewOrLatinName,
  phone: israeliPhoneNumber,
  email: emailAddress.optional().or(z.literal('')),
  subject: PracticeAreaSubject,
  message: z
    .string()
    .max(1000, 'ההודעה ארוכה מדי (מקסימום 1000 תווים)')
    .optional()
    .or(z.literal('')),
  consent_gdpr: z
    .boolean()
    .refine((val) => val === true, {
      message: 'יש לאשר את תנאי הפרטיות לפני שליחת הטופס',
    }),
  source: z
    .enum(['hero_form', 'contact_section', 'popup', 'whatsapp', 'other'])
    .default('contact_section'),
  referrer_url: z.string().url().max(2048).optional().or(z.literal('')),
});

export type LeadInput = z.infer<typeof LeadSchema>;

// ─── Contact Form Schema (lighter — no subject required) ───────────────────

export const ContactFormSchema = z.object({
  full_name: hebrewOrLatinName,
  phone: israeliPhoneNumber,
  email: emailAddress.optional().or(z.literal('')),
  message: z
    .string()
    .min(5, 'אנא כתוב הודעה קצרה')
    .max(1000, 'ההודעה ארוכה מדי'),
  consent_gdpr: z
    .boolean()
    .refine((val) => val === true, {
      message: 'יש לאשר את תנאי הפרטיות לפני שליחת הטופס',
    }),
});

export type ContactFormInput = z.infer<typeof ContactFormSchema>;

// ─── Helper: format Zod errors into a flat key→message map ─────────────────

export function formatZodErrors(
  errors: z.ZodError
): Record<string, string> {
  return errors.errors.reduce<Record<string, string>>((acc, err) => {
    const key = err.path.join('.');
    acc[key] = err.message;
    return acc;
  }, {});
}
