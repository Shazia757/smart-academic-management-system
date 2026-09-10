import * as React from "react";
import type { Metadata } from "next";
import { GraduationCap, ShieldCheck, Cpu } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Secure Institutional Sign-In | SAMS",
  description: "Sign in to the Smart Academic Management System with your institutional credentials.",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/30 to-primary/5">
      {/* Background Decorative Accents */}
      <div className="absolute top-12 left-12 h-64 w-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-12 right-12 h-64 w-64 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Institutional Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md mb-3">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Smart Academic Management System
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Enterprise Academic Platform • Single Sign-On Access
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl border border-border bg-card/90 p-8 shadow-glass backdrop-blur-md">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-foreground">
              Sign In to Your Account
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter your official academic email and password
            </p>
          </div>

          <React.Suspense
            fallback={
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                Loading secure login portal...
              </div>
            }
          >
            <LoginForm />
          </React.Suspense>
        </div>

        {/* Security Trust Badges */}
        <div className="mt-6 flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>PostgreSQL RLS Protected</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-primary" />
            <span>OR-Tools & Biometrics Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
