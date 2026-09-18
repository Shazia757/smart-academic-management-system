# SAMS — Final Submission Screenshot & Visual Evidence Checklist

**System**: Smart Academic Management System (SAMS)  
**Document**: Visual Evidence Verification & Screenshot Audit  
**Date**: September 18, 2026  
**Status**: 33 Screenshots Verified in `test-results/screenshots/`

---

## 1. Visual Verification Audit Table

| Verification Scope | Required Screen / Flow | Capture Status | Associated File in `test-results/screenshots/` |
| :--- | :--- | :---: | :--- |
| **Authentication** | Login View (Empty Form) | **CAPTURED** | `02_auth_empty_form_submit.png` |
| **Authentication** | Login View (Password Toggle) | **CAPTURED** | `04_auth_password_toggle.png` |
| **Authentication** | Login Failure (Invalid Password) | **CAPTURED** | `03_auth_invalid_password.png` |
| **Authentication** | Unauthenticated Route Redirect | **CAPTURED** | `01_auth_unauthenticated_redirect.png` |
| **Authentication** | Session Persistence on Refresh | **CAPTURED** | `06_auth_session_persistence_refresh.png` |
| **Security & RBAC** | Student Unauthorized Route (403) | **CAPTURED** | `10_security_unauthorized_student_access.png` |
| **Dashboards** | Super Administrator Operations Center | **CAPTURED** | `07_dashboard_superadmin_view.png` |
| **Dashboards** | Faculty Teaching Hub | **CAPTURED** | `08_dashboard_faculty_view.png` |
| **Dashboards** | Student Academic Portal | **CAPTURED** | `09_dashboard_student_view.png` |
| **Master Data** | Academic Structure (Years, Terms, Sections) | **CAPTURED** | `17_screen_academic_structure.png` |
| **Master Data** | Department Catalog | **CAPTURED** | `18_screen_departments.png` |
| **Master Data** | Classrooms & Laboratory Directory | **CAPTURED** | `19_screen_classrooms.png` |
| **Master Data** | Curriculum Subjects Catalog | **CAPTURED** | `20_screen_subjects.png` |
| **Master Data** | Faculty Directory | **CAPTURED** | `21_screen_faculty.png` |
| **Master Data** | Faculty Availability Matrix | **CAPTURED** | `22_screen_faculty_availability.png` |
| **Master Data** | Student Directory & USN Roster | **CAPTURED** | `23_screen_students.png` |
| **Master Data** | Course Allocations / Assignments | **CAPTURED** | `24_screen_assignments.png` |
| **Master Data** | Student Course Enrollments | **CAPTURED** | `25_screen_enrollments.png` |
| **Timetable** | Timetable Solver Launchpad | **CAPTURED** | `11_timetable_generate_initial_state.png` |
| **Timetable** | Solver Configuration & Parameters | **CAPTURED** | `12_timetable_config_selected.png` |
| **Timetable** | Timetable Configurations CRUD | **CAPTURED** | `13_timetable_configuration_crud_page.png` |
| **Timetable** | Published Timetable View | **REQUIRES MANUAL CAPTURE** | *To be captured during final presentation run* |
| **Timetable** | Conflict Validation Modal | **REQUIRES MANUAL CAPTURE** | *To be captured during final presentation run* |
| **Timetable** | Saved Draft & Generation History | **REQUIRES MANUAL CAPTURE** | *To be captured during final presentation run* |
| **Attendance** | Attendance Sessions Directory | **CAPTURED** | `14_attendance_sessions_directory.png` |
| **Attendance** | Create Attendance Session Modal | **CAPTURED** | `15_attendance_create_session_modal.png` |
| **Notifications** | Topbar Notification Bell Popover | **CAPTURED** | `16_notification_bell_interaction.png` |
| **Notifications** | Full Notification Inbox (`/notifications`) | **REQUIRES MANUAL CAPTURE** | *Newly created in Phase 7; capture during demo* |
| **Audit Logging** | Security Audit Ledger Table (`/audit-logs`) | **CAPTURED** | `26_screen_audit_logs.png` |
| **Responsive UI** | Mobile Portrait 320x568 (iPhone SE) | **CAPTURED** | `27_responsive_login_320x568_iPhoneSE.png` |
| **Responsive UI** | Mobile Portrait 375x667 (iPhone 8) | **CAPTURED** | `27_responsive_login_375x667_iPhone8.png` |
| **Responsive UI** | Mobile Portrait 390x844 (iPhone 14) | **CAPTURED** | `27_responsive_login_390x844_iPhone14.png` |
| **Responsive UI** | Tablet Portrait 768x1024 (iPad) | **CAPTURED** | `27_responsive_login_768x1024_iPadPortrait.png` |
| **Responsive UI** | Tablet Landscape 1024x768 (iPad) | **CAPTURED** | `27_responsive_login_1024x768_iPadLandscape.png` |
| **Responsive UI** | Laptop 1280x720 (720p HD) | **CAPTURED** | `27_responsive_login_1280x720_720pLaptop.png` |
| **Responsive UI** | Desktop 1440x900 (Widescreen) | **CAPTURED** | `27_responsive_login_1440x900_Desktop.png` |

---

## 2. Summary of Checklist

* **Total Visual Checklist Items**: 36 items
* **Pre-Captured and Verified in Repository**: **32 items**
* **Items Requiring Final Demo Capture**: **4 items**
  1. Published Timetable Grid with Immutable badge
  2. Multi-Draft Generation History tab
  3. Interactive Conflict Validation rejection banner
  4. New `/notifications` dedicated page inbox
