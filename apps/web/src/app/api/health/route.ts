import { NextResponse } from "next/server";
import { aiClient } from "@/lib/ai-client";

export async function GET() {
  const timestamp = new Date().toISOString();
  const aiHealth = await aiClient.checkHealth();

  return NextResponse.json({
    status: "healthy",
    app: "Smart Academic Management System (Web)",
    version: "0.1.0",
    environment: process.env.NODE_ENV || "development",
    timestamp,
    services: {
      web: { status: "online" },
      ai_microservice: {
        status: aiHealth.online ? "online" : "offline",
        details: aiHealth.data || null,
        error: aiHealth.error || null,
      },
      database: {
        configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
    },
  });
}
