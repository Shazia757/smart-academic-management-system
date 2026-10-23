"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CalendarDays,
  AlertTriangle,
  Info,
  ExternalLink,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  SystemNotification,
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
} from "@/server/actions/notifications";

interface NotificationsClientProps {
  initialNotifications: SystemNotification[];
}

export function NotificationsClient({ initialNotifications }: NotificationsClientProps) {
  const [notifications, setNotifications] = React.useState<SystemNotification[]>(initialNotifications);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [isMarkingAll, setIsMarkingAll] = React.useState(false);

  const unreadCount = React.useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const displayedNotifications = React.useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, filter]);

  const handleMarkAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await markNotificationAsReadAction(id);
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsAsReadAction();
    setIsMarkingAll(false);
  };

  const getNotificationIcon = (type: SystemNotification["type"]) => {
    switch (type) {
      case "TIMETABLE_UPDATE":
        return <CalendarDays className="h-4 w-4 text-primary" />;
      case "ATTENDANCE_WARNING":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "CLASS_CANCELLED":
      case "ROOM_CHANGE":
        return <AlertTriangle className="h-4 w-4 text-rose-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeBadgeVariant = (type: SystemNotification["type"]) => {
    switch (type) {
      case "TIMETABLE_UPDATE":
        return "accent";
      case "ATTENDANCE_WARNING":
        return "warning";
      case "CLASS_CANCELLED":
      case "ROOM_CHANGE":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Notifications & Alerts
              </h1>
              {unreadCount > 0 ? (
                <Badge variant="destructive" className="text-xs rounded-full px-2.5 py-0.5 font-semibold">
                  {unreadCount} Unread
                </Badge>
              ) : (
                <Badge variant="success" className="text-xs rounded-full px-2.5 py-0.5 font-semibold">
                  All Caught Up
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time timetable releases, room reassignments, and administrative notices.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAll}
              className="gap-2 text-xs rounded-xl shadow-subtle"
            >
              <CheckCheck className="h-4 w-4" />
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-xl border border-border/80">
          <button
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === "all"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === "unread"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
          <Clock className="h-3.5 w-3.5" />
          Sorted by newest
        </span>
      </div>

      {/* Notifications List */}
      {displayedNotifications.length === 0 ? (
        <Card className="rounded-2xl border-border/80 shadow-card">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mb-3">
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {filter === "unread" ? "No unread alerts" : "No notifications"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {filter === "unread"
                ? "You have acknowledged all active system notices and timetable updates."
                : "Your notifications inbox is completely empty."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayedNotifications.map((notification) => {
            const dateStr = new Date(notification.created_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            });

            return (
              <div
                key={notification.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                  notification.is_read
                    ? "border-border/80 bg-card hover:shadow-card"
                    : "border-primary/30 bg-primary/5 shadow-card hover:shadow-card-hover"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card border border-border/80 shadow-xs">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {notification.title}
                      </span>
                      <Badge variant={getTypeBadgeVariant(notification.type) as any} className="text-[10px] rounded-full px-2 py-0.5 font-semibold">
                        {notification.type.replace("_", " ")}
                      </Badge>
                      {!notification.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <span className="mt-2 block text-[11px] text-muted-foreground/80 font-mono">
                      {dateStr}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {notification.action_url && (
                    <Link
                      href={notification.action_url}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 text-xs h-9 rounded-xl shadow-subtle" })}
                      onClick={() => {
                        if (!notification.is_read) {
                          handleMarkAsRead(notification.id);
                        }
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Link>
                  )}
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(notification.id)}
                      className="gap-1.5 text-xs h-9 rounded-xl text-muted-foreground hover:text-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark Read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
