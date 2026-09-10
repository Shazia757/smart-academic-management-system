import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Academic Management System (SAMS)",
  description:
    "Enterprise-grade intelligent academic administration platform featuring Google OR-Tools timetable generation, computer vision facial recognition attendance, and real-time operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
