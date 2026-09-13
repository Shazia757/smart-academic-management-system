/**
 * SAMS — Phase 5 Step 5.1: Attendance Domain Foundation Test Suite
 *
 * Verifies all 10 required domain criteria:
 * 1. Valid session schema parsing
 * 2. Invalid dates and time formats
 * 3. Invalid or reversed time windows
 * 4. Valid attendance record parsing
 * 5. Invalid attendance statuses
 * 6. Invalid recognition methods
 * 7. Confidence score boundary validation (inclusive 0.0 - 1.0)
 * 8. Percentage and rounding calculations
 * 9. Zero-denominator safety
 * 10. Student/subject summaries and duplicate detection
 */

import {
  CreateAttendanceSessionSchema,
  UpdateAttendanceSessionSchema,
  AttendanceRecordSchema,
  BulkMarkAttendanceSchema,
  AttendanceStatusSchema,
  RecognitionMethodSchema,
  AttendanceSessionStatusSchema,
} from "../apps/web/src/server/validators/attendance";
import {
  calculateAttendancePercentage,
  validateSessionTimeWindow,
  detectDuplicateStudentRecords,
  summarizeStudentAttendance,
  summarizeSessionAttendance,
  summarizeSubjectAttendance,
} from "../apps/web/src/lib/attendance/attendance-utils";
import {
  normalizeSessionStatus,
  normalizeRecognitionMethod,
  type AttendanceRecord,
} from "../apps/web/src/types/attendance";

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`[${status}] Test ${String(id).padStart(2, " ")}: ${name} — ${details}`);
}

async function runTests() {
  console.log("================================================================================");
  console.log("SAMS PHASE 5 STEP 5.1: ATTENDANCE DOMAIN FOUNDATION TEST SUITE");
  console.log("Testing pure domain models, Zod validation, calculations, and boundaries");
  console.log("================================================================================\n");

  const DUMMY_UUID_1 = "11111111-1111-4111-8111-111111111111";
  const DUMMY_UUID_2 = "22222222-2222-4222-8222-222222222222";
  const DUMMY_UUID_3 = "33333333-3333-4333-8333-333333333333";
  const DUMMY_UUID_4 = "44444444-4444-4444-8444-444444444444";
  const DUMMY_UUID_5 = "55555555-5555-4555-8555-555555555555";

  // ---------------------------------------------------------------------------
  // Test 1: Valid Session Schema Parsing
  // ---------------------------------------------------------------------------
  const validSessionInput = {
    section_id: DUMMY_UUID_1,
    subject_id: DUMMY_UUID_2,
    faculty_id: DUMMY_UUID_3,
    classroom_id: DUMMY_UUID_4,
    timetable_entry_id: DUMMY_UUID_5,
    session_date: "2026-09-15",
    start_time: "09:00:00",
    end_time: "09:55:00",
    status: "OPEN",
  };

  const parse1 = CreateAttendanceSessionSchema.safeParse(validSessionInput);
  const test1Passed = parse1.success && parse1.data.status === "OPEN";
  recordTest(
    1,
    "Valid Session Schema Parsing",
    test1Passed,
    test1Passed
      ? "Valid session parsed cleanly with status OPEN and ISO date 2026-09-15"
      : `Failed: ${JSON.stringify(parse1.error?.format())}`
  );

  // ---------------------------------------------------------------------------
  // Test 2: Invalid Dates and Time Formats
  // ---------------------------------------------------------------------------
  const invalidDateInputs = [
    { ...validSessionInput, session_date: "invalid-date" },
    { ...validSessionInput, session_date: "2026-02-31" }, // Invalid calendar day
    { ...validSessionInput, session_date: "15/09/2026" }, // Non-ISO format
    { ...validSessionInput, start_time: "25:00:00" },     // Invalid hour
    { ...validSessionInput, start_time: "9am" },          // Malformed time
  ];

  const allInvalidDatesRejected = invalidDateInputs.every(
    (input) => !CreateAttendanceSessionSchema.safeParse(input).success
  );
  recordTest(
    2,
    "Invalid Dates & Time Formats",
    allInvalidDatesRejected,
    allInvalidDatesRejected
      ? "Correctly rejected malformed dates, invalid calendar days (Feb 31), and invalid hours"
      : "Failed: Some invalid dates or times passed validation"
  );

  // ---------------------------------------------------------------------------
  // Test 3: Invalid or Reversed Time Windows
  // ---------------------------------------------------------------------------
  const reversedTimeInput = {
    ...validSessionInput,
    start_time: "10:00:00",
    end_time: "09:00:00", // Before start time
  };
  const equalTimeInput = {
    ...validSessionInput,
    start_time: "10:00:00",
    end_time: "10:00:00", // Same as start time
  };

  const parseReversed = CreateAttendanceSessionSchema.safeParse(reversedTimeInput);
  const parseEqual = CreateAttendanceSessionSchema.safeParse(equalTimeInput);
  const windowUtilReversed = validateSessionTimeWindow("10:00:00", "09:00:00");
  const windowUtilValid = validateSessionTimeWindow("09:00:00", "09:55:00");

  const test3Passed =
    !parseReversed.success &&
    !parseEqual.success &&
    !windowUtilReversed.isValid &&
    windowUtilValid.isValid &&
    windowUtilValid.durationMinutes === 55;

  recordTest(
    3,
    "Invalid or Reversed Time Windows",
    test3Passed,
    test3Passed
      ? "Reversed and equal start/end times correctly rejected; valid 55-min window accepted"
      : "Failed: Time window validation did not properly enforce end_time > start_time"
  );

  // ---------------------------------------------------------------------------
  // Test 4: Valid Attendance Record Parsing
  // ---------------------------------------------------------------------------
  const validRecordInput = {
    session_id: DUMMY_UUID_1,
    student_id: DUMMY_UUID_2,
    status: "PRESENT",
    confidence_score: 0.95,
    recognition_method: "FACIAL_RECOGNITION",
    marked_at: "2026-09-15T09:05:00.000Z",
    remarks: "Verified via kiosk camera",
  };

  const parseRecord = AttendanceRecordSchema.safeParse(validRecordInput);
  const test4Passed = parseRecord.success && parseRecord.data.status === "PRESENT";
  recordTest(
    4,
    "Valid Attendance Record Parsing",
    test4Passed,
    test4Passed
      ? "Record parsed cleanly with FACIAL_RECOGNITION and confidence 0.95"
      : `Failed: ${JSON.stringify(parseRecord.error?.format())}`
  );

  // ---------------------------------------------------------------------------
  // Test 5: Invalid Attendance Statuses
  // ---------------------------------------------------------------------------
  const invalidStatuses = ["HALF_DAY", "ATTENDED", "UNKNOWN", "present", ""];
  const allInvalidStatusesRejected = invalidStatuses.every(
    (status) => !AttendanceStatusSchema.safeParse(status).success
  );
  const validStatusesAccepted = ["PRESENT", "ABSENT", "LATE", "EXCUSED"].every(
    (status) => AttendanceStatusSchema.safeParse(status).success
  );

  const test5Passed = allInvalidStatusesRejected && validStatusesAccepted;
  recordTest(
    5,
    "Invalid Attendance Statuses",
    test5Passed,
    test5Passed
      ? "Rejected non-canonical statuses; strictly accepted PRESENT, ABSENT, LATE, EXCUSED"
      : "Failed: Status enum validation permitted invalid status"
  );

  // ---------------------------------------------------------------------------
  // Test 6: Invalid Recognition Methods & Legacy Normalization
  // ---------------------------------------------------------------------------
  const invalidMethods = ["RFID", "BLUETOOTH", "BIOMETRIC_THUMB", "fingerprint"];
  const allInvalidMethodsRejected = invalidMethods.every(
    (m) => !RecognitionMethodSchema.safeParse(m).success
  );
  const validMethodsAccepted = ["MANUAL", "FACIAL_RECOGNITION", "IMPORT"].every(
    (m) => RecognitionMethodSchema.safeParse(m).success
  );

  // Test explicit normalization functions
  const norm1 = normalizeRecognitionMethod("AI_FACE_RECOGNITION");
  const norm2 = normalizeRecognitionMethod("FACULTY_OVERRIDE");
  const norm3 = normalizeRecognitionMethod("MANUAL_ENTRY");
  const normSession1 = normalizeSessionStatus("SCHEDULED");
  const normSession2 = normalizeSessionStatus("ACTIVE");
  const normSession3 = normalizeSessionStatus("COMPLETED");

  const test6Passed =
    allInvalidMethodsRejected &&
    validMethodsAccepted &&
    norm1 === "FACIAL_RECOGNITION" &&
    norm2 === "MANUAL" &&
    norm3 === "MANUAL" &&
    normSession1 === "OPEN" &&
    normSession2 === "OPEN" &&
    normSession3 === "CLOSED";

  recordTest(
    6,
    "Invalid Recognition Methods & Normalization",
    test6Passed,
    test6Passed
      ? "Canonical methods enforced; legacy aliases normalized cleanly without polluting canonical enum"
      : "Failed: Method validation or legacy normalization failed"
  );

  // ---------------------------------------------------------------------------
  // Test 7: Confidence Score Boundary Validation (Inclusive 0.0 - 1.0)
  // ---------------------------------------------------------------------------
  const baseRecord = {
    session_id: DUMMY_UUID_1,
    student_id: DUMMY_UUID_2,
    status: "PRESENT",
  };

  const scoreZero = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: 0.0 });
  const scoreOne = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: 1.0 });
  const scoreMid = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: 0.85 });
  const scoreBelowZero = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: -0.01 });
  const scoreAboveOne = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: 1.01 });
  const scoreNull = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: null });
  const scoreUndefined = AttendanceRecordSchema.safeParse({ ...baseRecord, confidence_score: undefined });

  const test7Passed =
    scoreZero.success &&
    scoreOne.success &&
    scoreMid.success &&
    scoreNull.success &&
    scoreUndefined.success &&
    !scoreBelowZero.success &&
    !scoreAboveOne.success;

  recordTest(
    7,
    "Confidence Score Boundary Validation",
    test7Passed,
    test7Passed
      ? "0.0 and 1.0 are valid; -0.01 and 1.01 are rejected; null and undefined supported"
      : "Failed: Confidence score boundaries not strictly enforced to [0.0, 1.0]"
  );

  // ---------------------------------------------------------------------------
  // Test 8: Percentage & Rounding Calculations
  // ---------------------------------------------------------------------------
  // 2 out of 3 = 66.6666...% -> rounds to 66.67%
  const pct1 = calculateAttendancePercentage(2, 3);
  // 3 out of 4 = 75.00%
  const pct2 = calculateAttendancePercentage(3, 4);
  // 10 out of 10 = 100.00%
  const pct3 = calculateAttendancePercentage(10, 10);
  // Custom precision 1: 2/3 -> 66.7%
  const pctPrecision1 = calculateAttendancePercentage(2, 3, { precision: 1 });
  // Clamping test: present > total should clamp to 100.00%
  const pctClamped = calculateAttendancePercentage(15, 10);

  const test8Passed =
    pct1 === 66.67 &&
    pct2 === 75.0 &&
    pct3 === 100.0 &&
    pctPrecision1 === 66.7 &&
    pctClamped === 100.0;

  recordTest(
    8,
    "Percentage & Rounding Calculations",
    test8Passed,
    test8Passed
      ? `Accurately rounded 2/3 to 66.67% and 3/4 to 75.00%; clamped overflow to 100.00%`
      : `Failed: pct1=${pct1}, pct2=${pct2}, pct3=${pct3}, clamped=${pctClamped}`
  );

  // ---------------------------------------------------------------------------
  // Test 9: Zero-Denominator Safety
  // ---------------------------------------------------------------------------
  const zeroOverZero = calculateAttendancePercentage(0, 0);
  const fiveOverZero = calculateAttendancePercentage(5, 0);
  const negativeDenominator = calculateAttendancePercentage(3, -5);
  const nanDenominator = calculateAttendancePercentage(3, NaN);

  const test9Passed =
    zeroOverZero === 0.0 &&
    fiveOverZero === 0.0 &&
    negativeDenominator === 0.0 &&
    nanDenominator === 0.0 &&
    !Number.isNaN(zeroOverZero) &&
    Number.isFinite(zeroOverZero);

  recordTest(
    9,
    "Zero-Denominator Safety",
    test9Passed,
    test9Passed
      ? "Zero, negative, or NaN total cleanly returns 0.00% without NaN or Infinity"
      : `Failed: zeroOverZero=${zeroOverZero}, fiveOverZero=${fiveOverZero}`
  );

  // ---------------------------------------------------------------------------
  // Test 10: Student/Subject Summaries & Duplicate Detection
  // ---------------------------------------------------------------------------
  // Build fixture records for a student
  const mockRecords: AttendanceRecord[] = [
    {
      id: "rec-1",
      session_id: DUMMY_UUID_1,
      student_id: DUMMY_UUID_2,
      status: "PRESENT",
      marked_at: "2026-09-10T09:00:00Z",
      recognition_method: "MANUAL",
      created_at: "2026-09-10T09:00:00Z",
    },
    {
      id: "rec-2",
      session_id: DUMMY_UUID_3,
      student_id: DUMMY_UUID_2,
      status: "LATE",
      marked_at: "2026-09-11T09:10:00Z",
      recognition_method: "FACIAL_RECOGNITION",
      created_at: "2026-09-11T09:10:00Z",
    },
    {
      id: "rec-3",
      session_id: DUMMY_UUID_4,
      student_id: DUMMY_UUID_2,
      status: "ABSENT",
      marked_at: "2026-09-12T09:00:00Z",
      recognition_method: "MANUAL",
      created_at: "2026-09-12T09:00:00Z",
    },
    {
      id: "rec-4",
      session_id: DUMMY_UUID_5,
      student_id: DUMMY_UUID_2,
      status: "EXCUSED",
      marked_at: "2026-09-13T09:00:00Z",
      recognition_method: "MANUAL",
      created_at: "2026-09-13T09:00:00Z",
    },
  ];

  // Standard policy: 1 PRESENT out of 4 = 25.00%
  const summaryStandard = summarizeStudentAttendance(mockRecords);
  // countLateAsHalf policy: 1 PRESENT + 0.5 LATE = 1.5 out of 4 = 37.50%
  const summaryLateHalf = summarizeStudentAttendance(mockRecords, { countLateAsHalf: true });
  // Low attendance check: 25% is below 75% threshold
  const isLow = summaryStandard.is_low_attendance;

  // Duplicate detection
  const duplicateRecords = [
    { student_id: DUMMY_UUID_1 },
    { student_id: DUMMY_UUID_2 },
    { student_id: DUMMY_UUID_1 }, // Duplicate
  ];
  const detectedDuplicates = detectDuplicateStudentRecords(duplicateRecords);

  // Bulk schema rejecting duplicates
  const bulkWithDuplicates = {
    session_id: DUMMY_UUID_1,
    records: [
      {
        session_id: DUMMY_UUID_1,
        student_id: DUMMY_UUID_1,
        status: "PRESENT",
      },
      {
        session_id: DUMMY_UUID_1,
        student_id: DUMMY_UUID_1, // Duplicate in same session
        status: "ABSENT",
      },
    ],
  };
  const parseBulkDuplicates = BulkMarkAttendanceSchema.safeParse(bulkWithDuplicates);

  const test10Passed =
    summaryStandard.total_sessions === 4 &&
    summaryStandard.present_count === 1 &&
    summaryStandard.late_count === 1 &&
    summaryStandard.absent_count === 1 &&
    summaryStandard.excused_count === 1 &&
    summaryStandard.attendance_percentage === 25.0 &&
    summaryLateHalf.attendance_percentage === 37.5 &&
    isLow === true &&
    detectedDuplicates.length === 1 &&
    detectedDuplicates[0] === DUMMY_UUID_1 &&
    !parseBulkDuplicates.success;

  recordTest(
    10,
    "Student/Subject Summaries & Duplicate Detection",
    test10Passed,
    test10Passed
      ? "Accurately summarized attendance with countLateAsHalf (37.50%), low-attendance flag, and duplicate student detection"
      : `Failed: summaryStandard=${JSON.stringify(summaryStandard)}, duplicates=${detectedDuplicates}`
  );

  // ---------------------------------------------------------------------------
  // Test Summary
  // ---------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("\n================================================================================");
  console.log("TEST SUMMARY");
  console.log("================================================================================");
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(
    passed === total
      ? "RESULT: ALL 10 PHASE 5 STEP 5.1 ATTENDANCE DOMAIN TESTS PASSED SUCCESSFULLY!"
      : "RESULT: SOME TESTS FAILED"
  );
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
