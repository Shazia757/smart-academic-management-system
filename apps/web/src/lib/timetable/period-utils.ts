import { BreakSlotInput } from "@/server/validators/timetable";

// Convert "HH:MM" or "HH:MM:SS" to total minutes from midnight
export function timeToMinutes(timeStr: string): number {
  const parts = (timeStr || "09:00").split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 60 + minutes;
}

// Convert total minutes from midnight to "HH:MM:SS"
export function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

// Compute deterministic period slots with break offsets
export function computePeriodSlots(
  configId: string,
  enabledDays: number[],
  periodsPerDay: number,
  periodDurationMinutes: number,
  startTime: string,
  breaks: BreakSlotInput[]
): Array<{
  timetable_configuration_id: string;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  is_active: boolean;
}> {
  const breakMap = new Map<number, number>();
  for (const b of breaks) {
    breakMap.set(b.period, b.duration);
  }

  const startMinutes = timeToMinutes(startTime);
  const slots: Array<{
    timetable_configuration_id: string;
    day_of_week: number;
    period_number: number;
    start_time: string;
    end_time: string;
    is_break: boolean;
    is_active: boolean;
  }> = [];

  // Sort enabled days ascending (e.g. 1=Mon .. 6=Sat)
  const sortedDays = [...enabledDays].sort((a, b) => a - b);

  for (const day of sortedDays) {
    let currentMinutes = startMinutes;

    for (let p = 1; p <= periodsPerDay; p++) {
      const slotStart = currentMinutes;
      const slotEnd = slotStart + periodDurationMinutes;

      slots.push({
        timetable_configuration_id: configId,
        day_of_week: day,
        period_number: p,
        start_time: minutesToTimeString(slotStart),
        end_time: minutesToTimeString(slotEnd),
        is_break: false,
        is_active: true,
      });

      currentMinutes = slotEnd;

      // Check if there is an intervening break after this period
      const breakDuration = breakMap.get(p);
      if (breakDuration) {
        currentMinutes += breakDuration;
      }
    }
  }

  return slots;
}

/**
 * Parses configuration break and metadata payload safely.
 */
export function extractConfigMetadata(rawMetadata: unknown): {
  breaks: BreakSlotInput[];
  enabled_days: number[];
  start_time: string;
} {
  const defaultDays = [1, 2, 3, 4, 5, 6];
  const defaultStartTime = "09:00:00";

  if (!rawMetadata) {
    return { breaks: [], enabled_days: defaultDays, start_time: defaultStartTime };
  }

  if (Array.isArray(rawMetadata)) {
    // Legacy array format: [{ period: 2, duration: 20, label: "Tea Break" }]
    return {
      breaks: rawMetadata.map((item: any) => ({
        period: Number(item.period || item.afterPeriod || 1),
        duration: Number(item.duration || item.durationMinutes || 15),
        label: String(item.label || item.name || "Break"),
      })),
      enabled_days: defaultDays,
      start_time: defaultStartTime,
    };
  }

  if (typeof rawMetadata === "object") {
    const meta = rawMetadata as any;
    const rawBreaks = Array.isArray(meta.breaks) ? meta.breaks : [];
    const breaks = rawBreaks.map((item: any) => ({
      period: Number(item.period || item.afterPeriod || 1),
      duration: Number(item.duration || item.durationMinutes || 15),
      label: String(item.label || item.name || "Break"),
    }));

    const enabled_days =
      Array.isArray(meta.enabled_days) && meta.enabled_days.length > 0
        ? meta.enabled_days
        : defaultDays;

    const start_time = typeof meta.start_time === "string" ? meta.start_time : defaultStartTime;

    return { breaks, enabled_days, start_time };
  }

  return { breaks: [], enabled_days: defaultDays, start_time: defaultStartTime };
}
