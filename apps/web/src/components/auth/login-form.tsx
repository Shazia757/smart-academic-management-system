"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
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
    <div className="space-y-6">
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="email"
            className="text-xs font-semibold text-foreground tracking-wide"
          >
            Institutional Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. superadmin@sams.edu"
              disabled={isLoading}
              className="w-full h-10 rounded-lg border border-input bg-background/80 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-xs font-semibold text-foreground tracking-wide"
            >
              Password
            </label>
            <span className="text-[11px] text-muted-foreground">
              Min. 6 characters
            </span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className="w-full h-10 rounded-lg border border-input bg-background/80 pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-10 font-semibold gap-2 transition-all mt-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying Credentials...
            </>
          ) : (
            "Sign In to SAMS"
          )}
        </Button>
      </form>

      {/* Quick Demo Sign-In Buttons */}
      <div className="pt-3 border-t border-border/50 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
            Quick Institutional Sign-In
          </span>
          <span className="text-[10px] text-muted-foreground">Dev Demo Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleQuickFill("superadmin@sams.edu", "SamsDev#2026!")}
            className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted/80 text-left transition-colors flex flex-col justify-between disabled:opacity-50"
          >
            <div className="font-bold text-foreground text-[11px] flex items-center justify-between">
              <span>Super Admin</span>
              <span className="text-[9px] px-1 rounded bg-primary/15 text-primary font-mono">ALL</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">superadmin@sams.edu</div>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleQuickFill("dean.cse@sams.edu", "SamsDev#2026!")}
            className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted/80 text-left transition-colors flex flex-col justify-between disabled:opacity-50"
          >
            <div className="font-bold text-foreground text-[11px] flex items-center justify-between">
              <span>College Admin</span>
              <span className="text-[9px] px-1 rounded bg-accent/20 text-accent font-mono">ADMIN</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">dean.cse@sams.edu</div>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleQuickFill("arun.kumar@sams.edu", "SamsDev#2026!")}
            className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted/80 text-left transition-colors flex flex-col justify-between disabled:opacity-50"
          >
            <div className="font-bold text-foreground text-[11px] flex items-center justify-between">
              <span>Faculty</span>
              <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-mono">TEACH</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">arun.kumar@sams.edu</div>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleQuickFill("rohit.verma@student.sams.edu", "SamsDev#2026!")}
            className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted/80 text-left transition-colors flex flex-col justify-between disabled:opacity-50"
          >
            <div className="font-bold text-foreground text-[11px] flex items-center justify-between">
              <span>Student</span>
              <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground font-mono">VIEW</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">rohit.verma@student...</div>
          </button>
        </div>
      </div>
    </div>
  );
}
