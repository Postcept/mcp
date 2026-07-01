// A thin, dependency-free HTTP client for the Postcept API. Uses the global
// fetch (Node 20+) so the MCP server stays self-contained and npx-runnable.
import type { Verification, VcrSummary, VerificationRequest } from "./types.js";

export class PostceptApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`Postcept API ${status}: ${detail}`);
    this.name = "PostceptApiError";
  }
}

export interface PostceptClientOptions {
  apiKey: string;
  baseUrl: string;
}

export class PostceptClient {
  constructor(private readonly opts: PostceptClientOptions) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      Accept: "application/json",
      ...extraHeaders,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(new URL(path, this.opts.baseUrl), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new PostceptApiError(0, `network error: ${(err as Error).message}`);
    }

    const text = await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const detail =
        (parsed && typeof parsed === "object" && "detail" in parsed
          ? JSON.stringify((parsed as { detail: unknown }).detail)
          : typeof parsed === "string"
            ? parsed
            : undefined) ?? res.statusText;
      throw new PostceptApiError(res.status, String(detail));
    }
    return parsed as T;
  }

  /** Verify a claimed completion and issue a signed receipt. */
  createVerification(request: VerificationRequest, idempotencyKey?: string): Promise<Verification> {
    const extra = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
    return this.request<Verification>("POST", "/v1/verifications", request, extra);
  }

  /** Fetch a past verification by id. */
  getVerification(id: string): Promise<Verification> {
    return this.request<Verification>("GET", `/v1/verifications/${encodeURIComponent(id)}`);
  }

  /** Re-verify a past verification against the live system of record. */
  reconcileVerification(id: string): Promise<Verification> {
    return this.request<Verification>(
      "POST",
      `/v1/verifications/${encodeURIComponent(id)}/reconcile`
    );
  }

  /** The organization's Verified Completion Rate. */
  verifiedCompletionRate(): Promise<VcrSummary> {
    return this.request<VcrSummary>("GET", "/v1/metrics/vcr");
  }
}
