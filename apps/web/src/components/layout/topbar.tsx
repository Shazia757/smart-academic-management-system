"use client";

import * as React from "react";
import { Bell, Search, Moon, Sun, LogOut } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/common/status-badge";
import { Profile } from "@/types/database";
import { logoutAction } from "@/server/actions/auth";

interface TopbarProps {
  profile?: Profile | null;
}

export function Topbar({ profile }: TopbarProps) {
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : "Academic User";

  const userInitials = profile
    ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase()
    : "U";

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-md">
      {/* Left: Breadcrumbs & Term badge */}
      <div className="flex items-center gap-4">
        <Breadcrumbs />
        <div className="hidden sm:block h-4 w-px bg-border" />
        <Badge variant="outline" className="hidden sm:inline-flex text-[11px] font-medium bg-muted/50">
          Academic Year 2026-2027 • Sem 5
        </Badge>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Global Search shortcut */}
        <div className="relative hidden md:flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search students, faculty, rooms... (Ctrl+K)"
            readOnly
            className="h-9 w-64 rounded-lg border border-input bg-background/50 pl-9 pr-3 text-xs text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none cursor-pointer"
          />
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle color theme"
        >
          {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              3
            </span>
          </button>
        </div>

        {/* Authenticated User Profile Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <Avatar
            src={profile?.avatar_url}
            fallback={userInitials}
            className="h-9 w-9 border border-primary/20 bg-primary/10 text-primary font-semibold text-xs"
          />
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-semibold text-foreground leading-tight">
              {displayName}
            </span>
            <div className="mt-0.5">
              {profile ? (
                <RoleBadge role={profile.role} />
              ) : (
                <Badge variant="outline" className="text-[10px]">Session Active</Badge>
              )}
            </div>
          </div>

          {/* Secure Logout Action */}
          <form action={logoutAction} className="ml-1">
            <button
              type="submit"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-destructive/15 hover:text-destructive hover:border-destructive/30 transition-colors"
              title="Sign out of SAMS"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
