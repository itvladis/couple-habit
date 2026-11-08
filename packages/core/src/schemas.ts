import { z } from 'zod';
import { isLocalDate, isValidTimeZone } from './domain/dates';
import { invalid } from './errors';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

export const HABIT_COLORS = ['mint', 'lavender', 'pink', 'sky', 'green', 'peach', 'coral', 'gold'] as const;
export const MAX_TITLE_LENGTH = 40;
export const MAX_WEEKLY_TIMES = 6;

export const localDateSchema = z.string().refine(isLocalDate, 'expected YYYY-MM-DD');

export const frequencySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekdays'),
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'duplicate weekdays'),
  }),
  z.object({ type: z.literal('weekly'), times: z.number().int().min(1).max(MAX_WEEKLY_TIMES) }),
]);

export const reminderSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('exact'), time: hhmm }),
  z.object({ type: z.literal('window'), from: hhmm, to: hhmm }).refine((r) => r.from < r.to, 'window must end after it starts'),
]);

export const habitInputSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  icon: z.string().regex(/^[a-z0-9-]{1,32}$/, 'unknown icon'),
  color: z.enum(HABIT_COLORS),
  frequency: frequencySchema,
  completionMode: z.enum(['all', 'any']),
  visibility: z.enum(['friends', 'private']),
});
export type HabitInput = z.infer<typeof habitInputSchema>;

export const habitPatchSchema = habitInputSchema.partial();
export type HabitPatch = z.infer<typeof habitPatchSchema>;

export const membershipPatchSchema = z.object({
  notifyOnCheck: z.boolean().optional(),
  reminder: reminderSchema.nullable().optional(),
  cardSize: z.enum(['normal', 'wide']).optional(),
});
export type MembershipPatch = z.infer<typeof membershipPatchSchema>;

export const settingsPatchSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, 'unknown time zone').optional(),
  language: z.enum(['ru', 'en']).nullable().optional(),
  theme: z.enum(['auto', 'dark', 'light']).optional(),
  remindersEnabled: z.boolean().optional(),
  weeklySummary: z
    .object({ enabled: z.boolean(), weekday: z.number().int().min(1).max(7), time: hhmm })
    .optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Validates untrusted input and turns failures into an `invalid` AppError. */
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(z.prettifyError(result.error));
  return result.data;
}
