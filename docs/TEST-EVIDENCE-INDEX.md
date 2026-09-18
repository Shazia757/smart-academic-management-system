# SAMS — Test Evidence & Verification Artifacts Index

**System**: Smart Academic Management System (SAMS)  
**Document**: Repository Test Evidence Index & Verification Traces  
**Date**: September 18, 2026  
**Status**: All Listed Files Verified to Exist in Workspace

---

## 1. Executive Summary

This index inventories all physical verification artifacts, JSON test evidence outputs, automated test logs, and visual UI screenshots captured in the repository. Every referenced file has been checked and verified on the local file system.

---

## 2. Timetable Persistence & Publishing Evidence (`test-results/timetable-persistence/`)

The following 17 JSON artifacts record live database responses received during execution of the Phase 6.5 test suites:

| Evidence File | Proven Invariant / Feature | Key Evidence Captured |
| :--- | :--- | :--- |
| [`persist-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persist-01.json) | Draft Creation | Saved generation ID, `generation_number = 1`, and 2 initial schedule entries. |
| [`persist-02.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persist-02.json) | Draft Retrieval | Deep retrieval of draft with joined faculty, classroom, and subject relations. |
| [`persist-03.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persist-03.json) | In-Place Slot Edit | Single slot update without modifying parent generation ID or deleting other slots. |
| [`persist-04.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persist-04.json) | Version Sequence | Incrementing `generation_number = 2` for revised draft, preventing PK collision. |
| [`persist-05.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persist-05.json) | Safe Deletion | Deletion of non-published draft generation and cascading slot cleanup. |
| [`validate-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/validate-01.json) | Faculty Double-Booking | Detection and rejection of schedule with faculty overlapping on Day 1, Period 1. |
| [`validate-02.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/validate-02.json) | Room Double-Booking | Detection and rejection of multiple sections assigned to same classroom simultaneously. |
| [`validate-03.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/validate-03.json) | Cohort Clashing | Detection and rejection of class section scheduled in two different rooms at same period. |
| [`auth-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/auth-01.json) | Student Publish Block | Unauthorized student JWT attempt to publish timetable rejected; status remains DRAFT. |
| [`publish-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/publish-01.json) | Atomic Publication | `is_published = true`, `status = PUBLISHED`, `published_at` timestamp, and 1 notification sent. |
| [`access-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/access-01.json) | Student Timetable Query | Student account receives published schedule for their enrolled section. |
| [`rules-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/rules-01.json) | Published Immutability | Attempt to modify published timetable entry rejected by database trigger constraint. |
| [`status-01.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/status-01.json) | Timetable Unpublishing | Timetable reverted from `PUBLISHED` to `GENERATED`; editing re-enabled. |
| [`step-15-sequential-persistence-evidence.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/step-15-sequential-persistence-evidence.json) | Full Lifecycle Chain | End-to-end 15-step state transition verification sequence. |
| [`verify-15.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/verify-15.json) | 15-Step Raw Dump | Raw database response log across all 15 verification steps. |
| [`api-endpoint-test-evidence.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/api-endpoint-test-evidence.json) | REST API Contract | 5 HTTP endpoint contracts verified (`GET /drafts`, `POST /publish`, etc.). |
| [`persistence-verification-evidence.json`](file:///c:/Users/shazi/smart-academic-management-system/test-results/timetable-persistence/persistence-verification-evidence.json) | Comprehensive Suite Log | Consolidated JSON report of all 14 Phase 6.5 test assertions. |

---

## 3. Visual UI Screenshots & Responsive Captures (`test-results/screenshots/`)

The following 33 PNG screenshots prove UI visual design, role dashboards, and responsive viewport fidelity:

### 3.1 Authentication & Security Flows
* `01_auth_unauthenticated_redirect.png`: Unauthenticated attempt redirected to `/login`.
* `02_auth_empty_form_submit.png`: Client-side validation on empty login submission.
* `03_auth_invalid_password.png`: Error banner on incorrect password entry.
* `04_auth_password_toggle.png`: Eye icon password visibility toggle.
* `05_auth_superadmin_login_success.png`: Successful Super Admin login state.
* `06_auth_session_persistence_refresh.png`: Session persistence after full browser reload.
* `10_security_unauthorized_student_access.png`: Student accessing admin route redirected to `/unauthorized`.

### 3.2 Role-Tailored Dashboards
* `07_dashboard_superadmin_view.png`: Super Administrator Operations Center with institutional counts.
* `08_dashboard_faculty_view.png`: Faculty Teaching Hub with weekly load, subjects, and turnout metrics.
* `09_dashboard_student_view.png`: Student Academic Portal with term, section, USN, and attendance %.

### 3.3 Core Academic & Administrative Modules
* `11_timetable_generate_initial_state.png`: Timetable generator configuration interface.
* `12_timetable_config_selected.png`: Solver parameter selection and cohort binding.
* `13_timetable_configuration_crud_page.png`: Timetable configuration management directory.
* `14_attendance_sessions_directory.png`: Attendance session directory with active filters.
* `15_attendance_create_session_modal.png`: Modal for scheduling a new class attendance session.
* `16_notification_bell_interaction.png`: Topbar notification bell and alert dropdown.
* `17_screen_academic_structure.png`: Academic years, semester terms, and section cohorts.
* `18_screen_departments.png`: Institutional departments directory.
* `19_screen_classrooms.png`: Lecture halls, research labs, and capacity management.
* `20_screen_subjects.png`: Curriculum subjects, credits, and weekly period requirements.
* `21_screen_faculty.png`: Faculty roster, employee IDs, and designations.
* `22_screen_faculty_availability.png`: Faculty weekly period availability matrix.
* `23_screen_students.png`: Student roster, admission records, and section assignments.
* `24_screen_assignments.png`: Faculty course teaching allocations.
* `25_screen_enrollments.png`: Student course enrollments.
* `26_screen_audit_logs.png`: Security audit ledger table.

### 3.4 Responsive Viewport Matrix
* `27_responsive_login_320x568_iPhoneSE.png`: Mobile viewport 320x568 (iPhone SE).
* `27_responsive_login_375x667_iPhone8.png`: Mobile viewport 375x667 (iPhone 8).
* `27_responsive_login_390x844_iPhone14.png`: Mobile viewport 390x844 (iPhone 14).
* `27_responsive_login_768x1024_iPadPortrait.png`: Tablet viewport 768x1024 (iPad Portrait).
* `27_responsive_login_1024x768_iPadLandscape.png`: Tablet viewport 1024x768 (iPad Landscape).
* `27_responsive_login_1280x720_720pLaptop.png`: Laptop viewport 1280x720 (720p HD).
* `27_responsive_login_1440x900_Desktop.png`: Desktop viewport 1440x900 (Widescreen).
