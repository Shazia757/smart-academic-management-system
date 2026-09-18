import { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getNotificationsAction } from "@/server/actions/notifications";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export const metadata: Metadata = {
  title: "Notifications & Alerts | Smart Academic Management System",
  description: "View timetable publication updates, class room changes, and institution announcements.",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const { data } = await getNotificationsAction();

  return <NotificationsClient initialNotifications={data} />;
}
