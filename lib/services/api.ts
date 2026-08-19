import "server-only";

import { auth0 } from "@/lib/auth/auth0";


const BACKEND_URL = process.env.BACKEND_URL;

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error("BACKEND_URL is not configured");
  }

  const { token } = await auth0.getAccessToken();

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Backend request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}