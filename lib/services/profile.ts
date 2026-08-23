export interface AuthenticatedProfile {
  id: string;
  role: string;
  email: string;
  name: string;
  permissions: string[];
  raw_claims: Record<string, unknown>;
}

export async function fetchProfile(accessToken: string): Promise<AuthenticatedProfile> {
  const response = await fetch(`${process.env.BACKEND_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Backend /me request failed with status ${response.status}`);
  }

  return response.json();
}
