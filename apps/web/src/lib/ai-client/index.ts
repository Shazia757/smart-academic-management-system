export interface AIHealthStatus {
  status: string;
  service: string;
  version: string;
  environment: string;
  uptime_seconds: number;
  calibration: {
    match_threshold: number;
    review_threshold: number;
    detection_confidence: number;
  };
  capabilities: {
    or_tools_enabled: boolean;
    vision_enabled: boolean;
    pgvector_ready: boolean;
  };
}

class AIServiceClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
    this.apiKey = process.env.AI_SERVICE_API_KEY || "sams_dev_secret_internal_key_2026";
  }

  private get headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Internal-API-Key": this.apiKey,
    };
  }

  /**
   * Health check and diagnostics ping
   */
  async checkHealth(): Promise<{ online: boolean; data?: AIHealthStatus; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        headers: this.headers,
        cache: "no-store",
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        return {
          online: false,
          error: `AI Service returned status ${response.status}: ${response.statusText}`,
        };
      }

      const data: AIHealthStatus = await response.json();
      return { online: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to connect to AI microservice";
      return { online: false, error: message };
    }
  }
}

export const aiClient = new AIServiceClient();
