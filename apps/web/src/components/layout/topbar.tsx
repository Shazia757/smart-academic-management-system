"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search, Moon, Sun, LogOut, Menu } from "lucide-react";
import { Breadcrumbs } from "./breadcrumbs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/common/status-badge";
import { Profile } from "@/types/database";
import { logoutAction } from "@/server/actions/auth";
import { getUnreadNotificationCountAction } from "@/server/actions/notifications";

interface TopbarProps {
  profile?: Profile | null;
  onOpenMobileMenu?: () => void;
}

export function Topbar({ profile, onOpenMobileMenu }: TopbarProps) {
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  React.useEffect(() => {
    if (profile) {
      getUnreadNotificationCountAction().then((count) => {
        setUnreadCount(count);
      });
    }
  }, [profile]);

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
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      {/* Left: Mobile menu trigger & Breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="flex lg:hidden h-8 w-8 items-center justify-center rounded border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
            title="Open navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="truncate">
          <Breadcrumbs />
        </div>

        <div className="hidden md:block h-3.5 w-px bg-border shrink-0" />
        <Badge
          variant="outline"
          className="hidden md:inline-flex text-[10px] font-medium text-muted-foreground bg-muted/30 py-0.5"
        >
          AY 2026-2027 • Sem 5
        </Badge>
      </div>

      {/* Right: Notification bell, Theme toggle, Profile */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Notification Bell */}
        <div className="relative">
          <Link
            href="/notifications"
            className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Institutional Notifications & Notices"
          >
            <Bell className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle color theme"
        >
          {isDarkMode ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Profile Pill & Role */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <Avatar
            src={profile?.avatar_url}
            fallback={userInitials}
            className="h-8 w-8 border border-border bg-muted text-foreground font-semibold text-xs"
          />
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-foreground leading-tight truncate max-w-[130px]">
              {displayName}
            </span>
            <span className="text-[10px] capitalize text-muted-foreground leading-none mt-0.5">
              {profile?.role ? profile.role.replace("_", " ") : "User"}
            </span>
          </div>

          {/* Secure Logout Action */}
          <form action={logoutAction} className="ml-1">
            <button
              type="submit"
              className="flex h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
              title="Sign out of SAMS"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
