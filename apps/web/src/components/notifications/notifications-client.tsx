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
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Notifications & Alerts
            </h1>
            {unreadCount > 0 ? (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} Unread
              </Badge>
            ) : (
              <Badge variant="success" className="text-xs">
                All Caught Up
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time timetable releases, room reassignments, and administrative notices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAll}
              className="gap-1.5 text-xs"
            >
              <CheckCheck className="h-4 w-4" />
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter("unread")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === "unread"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Sorted by newest
        </span>
      </div>

      {/* Notifications List */}
      {displayedNotifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground mb-3">
              <Bell className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
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
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border transition-all ${
                  notification.is_read
                    ? "border-border/60 bg-card/60 opacity-80"
                    : "border-primary/30 bg-primary/5 shadow-xs"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background border border-border">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {notification.title}
                      </span>
                      <Badge variant={getTypeBadgeVariant(notification.type) as any} className="text-[10px]">
                        {notification.type.replace("_", " ")}
                      </Badge>
                      {!notification.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <span className="mt-1.5 block text-[11px] text-muted-foreground/80 font-mono">
                      {dateStr}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {notification.action_url && (
                    <Link
                      href={notification.action_url}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1 text-xs h-8" })}
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
                      className="gap-1 text-xs h-8 text-muted-foreground hover:text-foreground"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
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
