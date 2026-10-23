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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&family=Google+Sans+Text:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,700&display=swap"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
