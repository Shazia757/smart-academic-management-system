# SAMS — Phase 4 Step 2: Working Days, Periods & Scheduling Configuration

## 1. Overview & Architectural Scope

Phase 4 Step 2 builds the production-quality scheduling configuration module on top of the Phase 4 Step 1 database foundation in the Smart Academic Management System (SAMS). 

Administrators can configure:
* **Academic Context**: Academic Year, Semester, and Class Section.
* **Institutional Working Days**: Explicit enabled/disabled days of the week (e.g., Monday through Saturday).
* **Daily Period Structure**: Periods per day (1 to 12) and period duration (15 to 180 minutes).
* **Daily Timing**: Daily start time (e.g., `09:00:00`).
* **Intermissions / Breaks**: Configurable break slots (e.g., 20-minute Tea Break after Period 2, 45-minute Lunch Break after Period 4) that dynamically push subsequent period times forward.
* **Deterministic Period Generation**: Generates explicit, persistent period slots in `public.timetable_periods`.

> [!IMPORTANT]
> **Out of Scope for Step 2**:
> * Google OR-Tools CP-SAT solver invocation
> * Automatic timetable generation / optimization algorithms
> * Facial recognition, biometric attendance, or predictive analytics
>
> The sole output of Step 2 is a validated, persisted set of explicit timetable period slots ready for consumption by the downstream solver.

---

## 2. Canonical Day Representation & Authority Rules

A critical architectural distinction is enforced between user interface metadata and persisted database period slots:

| Representation | Location | Role & Authority |
| :--- | :--- | :--- |
| **Persisted Scheduled Days** | `public.timetable_periods.day_of_week` | **AUTHORITATIVE CANONICAL TRUTH**. This column defines the actual physical days scheduled in the academic institution (where `1 = Monday, ..., 7 = Sunday`). Downstream timetable generators, solver constraints, faculty clash detection, and student attendance engines MUST read from `timetable_periods.day_of_week`. |
| **Configuration Metadata** | `public.timetable_configurations.break_after_periods.enabled_days` | **UI/CONFIGURATION PREFERENCE**. Stores the administrator's intended working day selection (e.g., `[1, 2, 3, 4, 5, 6]`) for form hydration and editing in the UI. |

### Contradiction Prevention
1. When generating period slots via `generatePeriodSlotsAction()`, the function iterates strictly over `enabled_days` and creates exactly one set of period slots per enabled day with `timetable_periods.day_of_week = day`.
2. When the user modifies `enabled_days` in the configuration form, the updated days are synchronized into configuration metadata.
3. Regeneration of period slots atomically replaces the configuration's slots to match the new working days (provided no generations or entries exist).

---

## 3. Configuration Lifecycle & Historical Preservation

To ensure academic history cannot be accidentally destroyed or corrupted, the system enforces the following rules:

### A. Configuration Soft Deactivation (No UI Hard Deletes)
* **Zero UI Delete Action**: The user interface intentionally exposes **NO** "Delete Timetable Configuration" button or workflow.
* **Soft Toggle**: Administrators can deactivate or activate configurations via `toggleConfigurationStatusAction()`, flipping `is_active` between `true` and `false`.
* **Historical Preservation**: Deactivating a configuration preserves all associated configuration settings, period slots, and any historical generations for record audits.
* **Internal Deletion Guard**: An internal helper `deleteTimetableConfigurationInternal()` is available only for test suite cleanup or database maintenance. It requires `ADMIN_ROLES`, validates that zero timetable generations exist, validates that zero timetable entries reference the configuration's periods, and will never delete historical timetable data.

### B. Historical Period Regeneration Guard
* The action `generatePeriodSlotsAction()` blocks regeneration if either:
  1. Any `timetable_generations` exist for the configuration (`timetable_generations.timetable_configuration_id = id`).
  2. Any `timetable_entries` reference the configuration's existing `timetable_periods`.
* If historical records exist, the operation aborts with a clear error:
  `"Cannot regenerate period slots: This configuration has existing timetable generations. Period slots are locked to protect historical academic records. Please create a new configuration instead."`
* If no generations or entries exist, regeneration safely clears and repopulates `timetable_periods`.

---

## 4. Deterministic Period Calculation Algorithm

Period start and end times are computed mathematically by `computePeriodSlots()` in `apps/web/src/lib/timetable/period-utils.ts`:

```typescript
for (const day of sortedDays) {
  let currentMinutes = startMinutes; // e.g. 540 for 09:00

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

    // Check for intervening break after period p
    const breakDuration = breakMap.get(p);
    if (breakDuration) {
      currentMinutes += breakDuration;
    }
  }
}
```

### Example Period Timeline (CSE-S5-A)
* **Daily Start**: `09:00:00`
* **Period Duration**: 55 minutes
* **Breaks**:
  * Period 2: 20 min Tea Break
  * Period 4: 45 min Lunch Break

| Period # | Start Time | End Time | Event / Following Break |
| :--- | :--- | :--- | :--- |
| **Period 1** | `09:00:00` | `09:55:00` | Class |
| **Period 2** | `09:55:00` | `10:50:00` | Class → **Tea Break (10:50 – 11:10, 20m)** |
| **Period 3** | `11:10:00` | `12:05:00` | Class |
| **Period 4** | `12:05:00` | `13:00:00` | Class → **Lunch Break (13:00 – 13:45, 45m)** |
| **Period 5** | `13:45:00` | `14:40:00` | Class |
| **Period 6** | `14:40:00` | `15:35:00` | Class |
| **Period 7** | `15:35:00` | `16:30:00` | Class |

*Total daily operational span: 09:00 – 16:30 (450 minutes).*

---

## 5. Module Architecture & File Map

| File | Purpose |
| :--- | :--- |
| `apps/web/src/types/database.ts` | TypeScript types for `TimetableConfiguration`, `TimetablePeriod`, and `BreakSlot`. |
| `apps/web/src/server/validators/timetable.ts` | Zod validation schemas for configuration creation, updating, period generation, and break slots. |
| `apps/web/src/lib/timetable/period-utils.ts` | Pure deterministic math utilities (`computePeriodSlots`, `extractConfigMetadata`, time conversion). |
| `apps/web/src/server/actions/timetable.ts` | Server Actions for creating, updating, soft toggling status, generating period slots, and internal deletion. |
| `apps/web/src/app/(dashboard)/timetable/configuration/page.tsx` | Next.js Server Component fetching configurations, academic years, semesters, sections, and slot counts. |
| `apps/web/src/components/timetable/timetable-configuration-client.tsx` | Rich interactive client UI featuring working day selection, period counts, break editor, and live schedule timeline preview. |
| `scripts/test-phase4-step2-configuration.ts` | Automated test suite verifying 18/18 configuration rules against the live Supabase PostgreSQL instance. |

---

## 6. Verification Results

| Test Category | Tests Passed | Status |
| :--- | :--- | :--- |
| **Phase 4 Step 2 Configuration Suite** | 18 of 18 | **PASSED** |
| **Phase 4 Step 1 Domain Regression** | 14 of 14 | **PASSED** |
| **TypeScript Compilation (`tsc --noEmit`)** | 0 errors | **PASSED** |
| **ESLint (`npm run lint`)** | 0 errors | **PASSED** |
| **Next.js Production Build (`npm run build`)** | Statically optimized, 17/17 routes OK | **PASSED** |
| **Browser Runtime UI Audit** | 0 console errors, 0 hydration warnings | **PASSED** |
