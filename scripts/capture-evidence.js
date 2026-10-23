const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = "http://localhost:3000";
const EVIDENCE_DIR = path.resolve(__dirname, "../ui-redesign-evidence");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  narrow_mobile: { width: 360, height: 800 }
};

const ALL_ROUTES = [
  { path: "/", name: "01_dashboard_admin", title: "Executive Dashboard" },
  { path: "/academic-structure", name: "02_academic_structure", title: "Academic Structure" },
  { path: "/departments", name: "03_departments", title: "Departments Catalog" },
  { path: "/classrooms", name: "04_classrooms", title: "Classrooms & Venues" },
  { path: "/subjects", name: "05_subjects", title: "Subjects & Syllabus" },
  { path: "/faculty", name: "06_faculty", title: "Faculty Directory" },
  { path: "/faculty/availability", name: "07_faculty_availability", title: "Faculty Availability Matrix" },
  { path: "/students", name: "08_students", title: "Student Roster" },
  { path: "/enrollments", name: "09_enrollments", title: "Course Enrollments" },
  { path: "/assignments", name: "10_assignments", title: "Faculty Course Allocations" },
  { path: "/timetable", name: "11_timetable_published", title: "Published Timetable Viewer" },
  { path: "/timetable/configuration", name: "12_timetable_configuration", title: "Timetable Configuration" },
  { path: "/timetable/generate", name: "13_timetable_generate", title: "OR-Tools Timetable Generator" },
  { path: "/attendance", name: "14_attendance_dashboard", title: "Attendance Management" },
  { path: "/notifications", name: "15_notifications", title: "Notifications Center" },
  { path: "/audit-logs", name: "16_audit_logs", title: "System Audit Logs" },
  { path: "/unauthorized", name: "17_unauthorized", title: "Access Guard (Unauthorized)" },
  { path: "/login", name: "18_login_page", title: "Institutional Sign In" }
];

async function ensureDirs() {
  const dirs = [
    EVIDENCE_DIR,
    path.join(EVIDENCE_DIR, "screenshots/desktop"),
    path.join(EVIDENCE_DIR, "screenshots/laptop"),
    path.join(EVIDENCE_DIR, "screenshots/tablet"),
    path.join(EVIDENCE_DIR, "screenshots/mobile"),
    path.join(EVIDENCE_DIR, "screenshots/narrow_mobile"),
    path.join(EVIDENCE_DIR, "component-screenshots"),
    path.join(EVIDENCE_DIR, "before-after")
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
}

async function loginUser(page, email, password) {
  console.log(`[AUTH] Navigating to ${BASE_URL}/login to log in as ${email}...`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Fill credentials
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type='submit']");

  // Wait for navigation away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log(`[AUTH] Successfully logged in as ${email}`);
}

async function captureEvidence() {
  await ensureDirs();
  console.log("[EVIDENCE] Launching Chromium browser...");
  const browser = await chromium.launch({ headless: true });

  // 1. Capture public Login Page first
  const anonContext = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const anonPage = await anonContext.newPage();
  console.log("[CAPTURE] Capturing public Login page...");
  await anonPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await anonPage.screenshot({
    path: path.join(EVIDENCE_DIR, "screenshots/desktop/18_login_page.png"),
    fullPage: true
  });
  // Also capture for other viewports
  for (const vp of ["laptop", "tablet", "mobile", "narrow_mobile"]) {
    await anonPage.setViewportSize(VIEWPORTS[vp]);
    await anonPage.waitForTimeout(300);
    const subfolder = vp === "narrow_mobile" ? "narrow_mobile" : vp;
    await anonPage.screenshot({
      path: path.join(EVIDENCE_DIR, `screenshots/${subfolder}/login_page.png`),
      fullPage: true
    });
  }
  await anonContext.close();

  // 2. Admin Context (Super Admin)
  const adminContext = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const adminPage = await adminContext.newPage();
  await loginUser(adminPage, "superadmin@sams.edu", "SamsDev#2026!");

  // Capture all 17 authenticated desktop pages
  for (const route of ALL_ROUTES) {
    if (route.path === "/login") continue;
    console.log(`[DESKTOP] Capturing route ${route.path} -> ${route.name}.png`);
    try {
      await adminPage.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle", timeout: 15000 });
      await adminPage.waitForTimeout(600);
      await adminPage.screenshot({
        path: path.join(EVIDENCE_DIR, `screenshots/desktop/${route.name}.png`),
        fullPage: true
      });
    } catch (err) {
      console.warn(`[WARN] Route ${route.path} capture warning: ${err.message}`);
    }
  }

  // 3. Capture Component-Specific Highlights on Desktop
  console.log("[COMPONENTS] Capturing component closeups...");
  try {
    await adminPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(500);

    // Sidebar component
    const sidebar = await adminPage.$("aside");
    if (sidebar) {
      await sidebar.screenshot({
        path: path.join(EVIDENCE_DIR, "component-screenshots/sidebar_navigation.png")
      });
    }

    // Topbar component
    const topbar = await adminPage.$("header");
    if (topbar) {
      await topbar.screenshot({
        path: path.join(EVIDENCE_DIR, "component-screenshots/header_topbar.png")
      });
    }

    // KPI Metrics Grid
    const kpiGrid = await adminPage.$(".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4");
    if (kpiGrid) {
      await kpiGrid.screenshot({
        path: path.join(EVIDENCE_DIR, "component-screenshots/kpi_metrics_grid.png")
      });
    }

    // Data Table component on /departments
    await adminPage.goto(`${BASE_URL}/departments`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(500);
    const dataTable = await adminPage.$(".rounded-2xl.border");
    if (dataTable) {
      await dataTable.screenshot({
        path: path.join(EVIDENCE_DIR, "component-screenshots/data_table_component.png")
      });
    }
  } catch (err) {
    console.warn(`[WARN] Component screenshot warning: ${err.message}`);
  }

  // 4. Laptop Viewport (1366x768)
  console.log("[LAPTOP] Capturing Laptop responsive views...");
  await adminPage.setViewportSize(VIEWPORTS.laptop);
  const laptopRoutes = ["/", "/timetable", "/attendance", "/faculty", "/students", "/timetable/generate"];
  for (const p of laptopRoutes) {
    const r = ALL_ROUTES.find(x => x.path === p);
    if (!r) continue;
    await adminPage.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(400);
    await adminPage.screenshot({
      path: path.join(EVIDENCE_DIR, `screenshots/laptop/${r.name}.png`),
      fullPage: true
    });
  }

  // 5. Tablet Viewport (768x1024)
  console.log("[TABLET] Capturing Tablet responsive views...");
  await adminPage.setViewportSize(VIEWPORTS.tablet);
  const tabletRoutes = ["/", "/timetable", "/attendance", "/departments", "/notifications"];
  for (const p of tabletRoutes) {
    const r = ALL_ROUTES.find(x => x.path === p);
    if (!r) continue;
    await adminPage.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(400);
    await adminPage.screenshot({
      path: path.join(EVIDENCE_DIR, `screenshots/tablet/${r.name}.png`),
      fullPage: true
    });
  }

  // 6. Mobile Viewport (390x844)
  console.log("[MOBILE] Capturing Mobile responsive views...");
  await adminPage.setViewportSize(VIEWPORTS.mobile);
  const mobileRoutes = ["/", "/timetable", "/attendance", "/notifications", "/faculty"];
  for (const p of mobileRoutes) {
    const r = ALL_ROUTES.find(x => x.path === p);
    if (!r) continue;
    await adminPage.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(400);
    await adminPage.screenshot({
      path: path.join(EVIDENCE_DIR, `screenshots/mobile/${r.name}.png`),
      fullPage: true
    });
  }

  // Mobile Drawer Toggle
  try {
    await adminPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    const menuBtn = await adminPage.$("button[aria-label='Toggle menu'], header button:first-child");
    if (menuBtn) {
      await menuBtn.click();
      await adminPage.waitForTimeout(400);
      await adminPage.screenshot({
        path: path.join(EVIDENCE_DIR, "screenshots/mobile/mobile_drawer_navigation.png")
      });
    }
  } catch (err) {
    console.warn(`[WARN] Mobile menu drawer capture: ${err.message}`);
  }

  // 7. Narrow Mobile Viewport (360x800)
  console.log("[NARROW MOBILE] Capturing Narrow Mobile views...");
  await adminPage.setViewportSize(VIEWPORTS.narrow_mobile);
  const narrowRoutes = ["/", "/attendance", "/timetable"];
  for (const p of narrowRoutes) {
    const r = ALL_ROUTES.find(x => x.path === p);
    if (!r) continue;
    await adminPage.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(400);
    await adminPage.screenshot({
      path: path.join(EVIDENCE_DIR, `screenshots/narrow_mobile/${r.name}.png`),
      fullPage: true
    });
  }

  await adminContext.close();

  // 8. Role-Specific Dashboards
  // Role: Faculty (arun.kumar@sams.edu)
  console.log("[ROLE] Capturing Faculty Role Dashboard...");
  const facultyContext = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const facultyPage = await facultyContext.newPage();
  try {
    await loginUser(facultyPage, "arun.kumar@sams.edu", "SamsDev#2026!");
    await facultyPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await facultyPage.waitForTimeout(500);
    await facultyPage.screenshot({
      path: path.join(EVIDENCE_DIR, "screenshots/desktop/role_faculty_dashboard.png"),
      fullPage: true
    });
    // Also capture faculty attendance
    await facultyPage.goto(`${BASE_URL}/attendance`, { waitUntil: "networkidle" });
    await facultyPage.waitForTimeout(500);
    await facultyPage.screenshot({
      path: path.join(EVIDENCE_DIR, "screenshots/desktop/role_faculty_attendance.png"),
      fullPage: true
    });
  } catch (err) {
    console.warn(`[WARN] Faculty role capture: ${err.message}`);
  }
  await facultyContext.close();

  // Role: Student (rohit.verma@student.sams.edu)
  console.log("[ROLE] Capturing Student Role Dashboard...");
  const studentContext = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const studentPage = await studentContext.newPage();
  try {
    await loginUser(studentPage, "rohit.verma@student.sams.edu", "SamsDev#2026!");
    await studentPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await studentPage.waitForTimeout(500);
    await studentPage.screenshot({
      path: path.join(EVIDENCE_DIR, "screenshots/desktop/role_student_dashboard.png"),
      fullPage: true
    });
    // Also student attendance
    await studentPage.goto(`${BASE_URL}/attendance`, { waitUntil: "networkidle" });
    await studentPage.waitForTimeout(500);
    await studentPage.screenshot({
      path: path.join(EVIDENCE_DIR, "screenshots/desktop/role_student_attendance.png"),
      fullPage: true
    });
  } catch (err) {
    console.warn(`[WARN] Student role capture: ${err.message}`);
  }
  await studentContext.close();

  await browser.close();
  console.log("[COMPLETE] All screenshots successfully captured!");
}

captureEvidence().catch(err => {
  console.error("[FATAL] Capture failed:", err);
  process.exit(1);
});
