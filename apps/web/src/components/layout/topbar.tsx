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
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border/80 bg-card px-4 sm:px-6">
      {/* Left: Mobile menu trigger & Breadcrumbs */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="flex lg:hidden h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 transition-colors"
            title="Open navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        <div className="truncate">
          <Breadcrumbs />
        </div>

        <div className="hidden md:block h-4 w-px bg-border/80 shrink-0" />
        <Badge
          variant="outline"
          className="hidden md:inline-flex text-[11px] font-semibold text-primary bg-primary/10 border-primary/20 py-0.5 px-2.5 rounded-full"
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
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
            title="Institutional Notifications & Notices"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-xs">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
          title="Toggle color theme"
        >
          {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Profile Pill & Role */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-border/80">
          <Avatar
            src={profile?.avatar_url}
            fallback={userInitials}
            className="h-9 w-9 rounded-xl border border-border/80 bg-primary/10 text-primary font-bold text-xs"
          />
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-foreground leading-tight truncate max-w-[140px]">
              {displayName}
            </span>
            <span className="text-[10px] capitalize text-muted-foreground font-medium leading-none mt-0.5">
              {profile?.role ? profile.role.replace("_", " ") : "User"}
            </span>
          </div>

          {/* Secure Logout Action */}
          <form action={logoutAction} className="ml-1">
            <button
              type="submit"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all duration-150"
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
