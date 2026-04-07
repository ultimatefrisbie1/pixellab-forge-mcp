import { logJobStart } from "./job-log.js";

const BASE_URL = "https://api.pixellab.ai/v2";

function debugLog(msg: string) {
  process.stderr.write(`[pixellab-forge-mcp] ${msg}\n`);
}

export class PixelLabClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(contentType = "application/json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": contentType,
    };
  }

  async get(path: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async delete(path: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DELETE ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PATCH ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const jsonBody = JSON.stringify(body);
    debugLog(`POST ${path} — payload size: ${jsonBody.length} bytes`);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: jsonBody,
    });

    debugLog(`POST ${path} — response status: ${res.status}`);

    if (res.status === 200) {
      return res.json();
    }

    if (res.status === 202) {
      const data = (await res.json()) as { job_id?: string; background_job_id?: string };
      const jobId = data.job_id ?? data.background_job_id;
      debugLog(`POST ${path} — background job: ${jobId}`);
      if (jobId) {
        logJobStart(jobId, path);
      }
      return {
        status: "processing",
        job_id: jobId,
        endpoint: path,
        message: `Job ${jobId} is processing. Use get_job_status with this job_id to check progress and retrieve results.`,
      };
    }

    const text = await res.text();
    debugLog(`POST ${path} — ERROR ${res.status}: ${text}`);
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
}
