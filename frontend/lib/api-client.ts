"use client";

import { beginApiRequest, endApiRequest } from "@/lib/api-activity";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function isGetRequest(init?: RequestInit) {
  return (init?.method ?? "GET").toUpperCase() === "GET";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const requestUrl = `${API_BASE}${path}`;
  const shouldDedupe = isGetRequest(init);
  if (shouldDedupe) {
    const cached = inFlightGetRequests.get(requestUrl);
    if (cached) {
      return (await cached) as T;
    }
  }

  const requestPromise = (async () => {
    beginApiRequest();

    try {
      const response = await fetch(requestUrl, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        let detail = `API request failed: ${response.status}`;
        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload.detail) {
            detail = payload.detail;
          }
        } catch {
          // Ignore non-JSON error bodies.
        }
        throw new ApiError(response.status, detail);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      endApiRequest();
      if (shouldDedupe) {
        inFlightGetRequests.delete(requestUrl);
      }
    }
  })();

  if (shouldDedupe) {
    inFlightGetRequests.set(requestUrl, requestPromise);
  }

  return await requestPromise;
}
