# Issues, Blocked Items & Limitations

**Project:** Smart Academic Management System (SAMS)  
**Scope:** UI/UX Redesign & Verification  
**Evaluation Date:** 2026-10-23  

---

## 1. Verified Working Functionality

- All 19 Next.js App Router routes compile, build, and render without errors.
- Supabase session management, authentication middleware, and role-based route guards function normally.
- Design system tokens propagate consistently across desktop, laptop, tablet, and mobile breakpoints.
- Zero mock data or simulated responses were added; real Supabase seed data is leveraged.

---

## 2. Documented Environmental Limitations & Non-Regressions

1. **Python AI Microservice (`apps/ai-service`)**:
   - The FastAPI AI solver runs as an independent microservice (`http://localhost:8000`). In local environments where the FastAPI service is not started simultaneously with the web app, timetable generation will report a connection warning. This is expected architecture behavior and not a UI regression.
   - The UI correctly maintains the loading state, error alert banners, and constraint validation feedback.

2. **Facial Recognition / Biometric Pipeline**:
   - Per project guidelines and master rules, the current attendance module implements manual and session-based verification. Facial recognition endpoints exist in the architecture roadmap, but manual entry workflows remain the active implementation. No fake automated biometric scans were simulated.

3. **Database Mutation in Test Automation**:
   - Automated screenshot capture scripts intentionally perform read-only queries and session validations to avoid destructive modifications to user database seed records.

4. **Third-Party External Identity Providers**:
   - Institutional sign-in operates against local and Supabase authentication instances. Single Sign-On (SSO) or OAuth providers depend on production identity provider secrets and were not invoked during local regression checks.
