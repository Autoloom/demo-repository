import { auth0 } from "@/lib/auth/auth0";
import { fetchProfile } from "@/lib/services/profile";
import ProfileResult from "@/components/auth/profile-result";

export default async function DashboardPage() {
  let profile;
  try {
    const { token } = await auth0.getAccessToken();
    profile = await fetchProfile(token);
  } catch {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Signed in, but couldn&apos;t reach the backend to load your profile.
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-full items-center justify-center p-6">
      <ProfileResult profile={profile} />
    </main>
  );
}
