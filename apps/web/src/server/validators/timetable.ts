import { z } from "zod";

// -----------------------------------------------------------------------------
// 1. BREAK SLOT SCHEMA
// -----------------------------------------------------------------------------
export const BreakSlotSchema = z.object({
  period: z
    .number()
    .int("Period must be an integer")
    .min(1, "Period must be at least 1")
    .max(12, "Period cannot exceed 12"),
  duration: z
    .number()
    .int("Duration must be an integer")
    .min(5, "Break duration must be at least 5 minutes")
    .max(120, "Break duration cannot exceed 120 minutes"),
  label: z
    .string()
    .min(1, "Break label cannot be empty")
    .max(50, "Break label cannot exceed 50 characters"),
});

export type BreakSlotInput = z.infer<typeof BreakSlotSchema>;

// -----------------------------------------------------------------------------
// 2. TIMETABLE CONFIGURATION SCHEMA
// -----------------------------------------------------------------------------
export const TimetableConfigurationSchema = z
  .object({
    name: z
      .string()
      .min(2, "Configuration name must be at least 2 characters")
      .max(150, "Configuration name cannot exceed 150 characters"),
    description: z
      .string()
      .max(500, "Description cannot exceed 500 characters")
      .optional()
      .nullable(),
    academic_year_id: z.string().uuid("Invalid Academic Year ID"),
    semester_id: z.string().uuid("Invalid Semester ID"),
    section_id: z.string().uuid("Invalid Class Section ID"),
    enabled_days: z
      .array(z.number().int().min(1, "Day must be between 1 and 7").max(7, "Day must be between 1 and 7"))
      .min(1, "At least one working day must be enabled")
      .max(7, "Cannot exceed 7 working days")
      .refine(
        (days) => new Set(days).size === days.length,
        "Duplicate days are not allowed in enabled working days"
      ),
    periods_per_day: z
      .number()
      .int()
      .min(1, "At least 1 period per day required")
      .max(12, "Maximum 12 periods per day allowed")
      .default(7),
    period_duration_minutes: z
      .number()
      .int()
      .min(15, "Period duration must be at least 15 minutes")
      .max(180, "Period duration cannot exceed 180 minutes")
      .default(55),
    start_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Start time must be in HH:MM or HH:MM:SS format")
      .default("09:00:00"),
    breaks: z.array(BreakSlotSchema).default([]),
    is_active: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // Check break periods are strictly before the final period
      return data.breaks.every((b) => b.period < data.periods_per_day);
    },
    {
      message: "Breaks can only be scheduled between periods (period must be less than periods per day)",
      path: ["breaks"],
    }
  )
  .refine(
    (data) => {
      // Check unique break positions
      const periods = data.breaks.map((b) => b.period);
      return new Set(periods).size === periods.length;
    },
    {
      message: "Multiple breaks cannot be scheduled after the same period number",
      path: ["breaks"],
    }
  )
  .refine(
    (data) => {
      // Check total daily duration does not overflow 24 hours
      const [startHour, startMin] = data.start_time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const totalPeriodMinutes = data.periods_per_day * data.period_duration_minutes;
      const totalBreakMinutes = data.breaks.reduce((acc, b) => acc + b.duration, 0);
      const endMinutes = startMinutes + totalPeriodMinutes + totalBreakMinutes;
      return endMinutes < 1440; // 24 * 60
    },
    {
      message: "Calculated schedule spans past midnight; please adjust start time, periods, or durations",
      path: ["start_time"],
    }
  );

export const UpdateTimetableConfigurationSchema = z
  .object({
    id: z.string().uuid("Invalid configuration ID"),
    name: z.string().min(2).max(150).optional(),
    description: z.string().max(500).optional().nullable(),
    enabled_days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Duplicate days are not allowed")
      .optional(),
    periods_per_day: z.number().int().min(1).max(12).optional(),
    period_duration_minutes: z.number().int().min(15).max(180).optional(),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional(),
    breaks: z.array(BreakSlotSchema).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.breaks && data.periods_per_day) {
        return data.breaks.every((b) => b.period < (data.periods_per_day as number));
      }
      return true;
    },
    {
      message: "Breaks can only be scheduled between periods (period must be less than periods per day)",
      path: ["breaks"],
    }
  )
  .refine(
    (data) => {
      if (data.breaks) {
        const periods = data.breaks.map((b) => b.period);
        return new Set(periods).size === periods.length;
      }
      return true;
    },
    {
      message: "Multiple breaks cannot be scheduled after the same period number",
      path: ["breaks"],
    }
  );

export const GeneratePeriodsSchema = z.object({
  configuration_id: z.string().uuid("Invalid configuration ID"),
  force: z.boolean().optional().default(false),
});

// -----------------------------------------------------------------------------
// 3. TIMETABLE GENERATION SOLVER SCHEMA
// -----------------------------------------------------------------------------
export const GenerateTimetableSchema = z.object({
  configuration_id: z.string().uuid("Configuration ID must be a valid UUID"),
  section_id: z.string().uuid("Section ID must be a valid UUID"),
  timeout_seconds: z
    .number()
    .int("Timeout must be an integer")
    .min(1, "Timeout must be at least 1 second")
    .max(300, "Timeout cannot exceed 300 seconds")
    .default(30),
  random_seed: z
    .number()
    .int("Random seed must be an integer")
    .default(42),
});

export type TimetableConfigurationInput = z.infer<typeof TimetableConfigurationSchema>;
export type UpdateTimetableConfigurationInput = z.infer<typeof UpdateTimetableConfigurationSchema>;
export type GeneratePeriodsInput = z.input<typeof GeneratePeriodsSchema>;
export type GenerateTimetableInput = z.input<typeof GenerateTimetableSchema>;
export type GenerateTimetableData = z.infer<typeof GenerateTimetableSchema>;

