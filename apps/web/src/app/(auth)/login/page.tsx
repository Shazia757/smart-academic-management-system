import * as React from "react";
import type { Metadata } from "next";
import { GraduationCap, ShieldCheck, Lock, CalendarCheck, Loader2 } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Secure Institutional Sign-In | SAMS",
  description: "Sign in to the Smart Academic Management System with your institutional credentials.",
};


export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F4F8FA] text-slate-900 lg:grid lg:grid-cols-2">
      {/* Left: Institutional Branding */}
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#0F4C5C] p-12 text-white lg:flex xl:p-16">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-[#176477] opacity-60 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0F4C5C] shadow-lg">
            <GraduationCap className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">SAMS Academic</p>
            <p className="text-xs text-teal-100">
              Smart Academic Management
            </p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl py-12">


          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Smarter campus management.
            <span className="mt-2 block text-teal-200">
              One connected platform.
            </span>
          </h1>

          <p className="mt-6 max-w-md text-sm leading-7 text-teal-100/90 xl:text-base">
            Access academic records, manage timetables, monitor attendance,
            and stay informed through one centralized institutional portal.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <CalendarCheck className="mb-4 h-6 w-6 text-teal-200" />
              <p className="text-sm font-semibold">Academic Planning</p>
              <p className="mt-1 text-xs leading-5 text-teal-100/80">
                Timetable and academic coordination
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <ShieldCheck className="mb-4 h-6 w-6 text-teal-200" />
              <p className="text-sm font-semibold">Secure Access</p>
              <p className="mt-1 text-xs leading-5 text-teal-100/80">
                Role-based institutional access
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/15 pt-6 text-xs text-teal-100/80">
          <span>Smart Academic Management System</span>
          <span>Institutional Portal</span>
        </div>
      </section>

      {/* Right: Login Area */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile Branding */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F4C5C] text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold tracking-tight text-[#0F4C5C]">
                SAMS Academic
              </p>
              <p className="text-xs text-slate-500">
                Smart Academic Management
              </p>
            </div>
          </div>

          <div className="mb-8">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#DCECEF] text-[#0F4C5C]">
              <Lock className="h-5 w-5" />
            </div>

            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#0F4C5C]">
              Welcome Back
            </p>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Sign in to SAMS
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Enter your institutional credentials to access your academic
              workspace.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_40px_rgba(15,76,92,0.07)] sm:p-8">
            <React.Suspense
              fallback={
                <div className="flex h-48 items-center justify-center gap-3 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-[#0F4C5C]" />
                  Loading secure login portal...
                </div>
              }
            >
              <LoginForm />
            </React.Suspense>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#0F4C5C]" />
            <span>Secure institutional authentication</span>
          </div>

          <p className="mt-8 text-center text-[11px] leading-5 text-slate-400">
            Smart Academic Management System
            <span className="mx-2">·</span>
            Authorized users only
          </p>
        </div>
      </section>
    </div>
  );
}

