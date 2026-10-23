"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Loader2, AlertCircle, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/server/actions/auth";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    urlError === "account_deactivated"
      ? "This account has been deactivated. Please contact your college administrator."
      : null
  );

  const performSignIn = async (userEmail: string, userPass: string) => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      // 1. Authenticate via browser Supabase client to set cookies directly in document.cookie
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: userPass,
      });

      if (authError) {
        setErrorMessage(authError.message || "Invalid email or password.");
        setIsLoading(false);
        return;
      }

      // 2. Also invoke server action for audit logging and server-side profile verification
      const serverResult = await loginAction({ email: userEmail, password: userPass });

      if (!serverResult.success) {
        setErrorMessage(serverResult.error || "Authentication failed.");
        setIsLoading(false);
        return;
      }

      // 3. Full navigation reload to synchronize authenticated cookies with middleware
      const targetUrl = redirectPath && redirectPath !== "/login" ? redirectPath : "/";
      window.location.href = targetUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network or connection error. Please try again.";
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSignIn(email, password);
  };

  const handleQuickFill = async (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    await performSignIn(quickEmail, quickPass);
  };

 
return (
  <div className="space-y-5">
    {/* Authentication Error */}
    {errorMessage && (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1 leading-6">{errorMessage}</div>
      </div>
    )}

    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Institutional Email */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-semibold text-slate-700"
        >
          Institutional Email
        </label>

        <div className="relative">
          <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@college.edu"
            disabled={isLoading}
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0F4C5C] focus:bg-white focus:ring-4 focus:ring-[#0F4C5C]/10 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="password"
            className="text-sm font-semibold text-slate-700"
          >
            Password
          </label>

          <span className="text-xs text-slate-400">
            Min. 6 characters
          </span>
        </div>

        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={isLoading}
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-12 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#0F4C5C] focus:bg-white focus:ring-4 focus:ring-[#0F4C5C]/10 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[#0F4C5C] disabled:opacity-50"
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Sign In */}
      <Button
        type="submit"
        disabled={isLoading}
        className="mt-2 h-12 w-full rounded-xl bg-[#0F4C5C] font-semibold text-white shadow-sm transition hover:bg-[#0B3D4A] focus-visible:ring-4 focus-visible:ring-[#0F4C5C]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying Credentials...
          </>
        ) : (
          <>
            Sign In to SAMS
            <ChevronRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  </div>
);

}
