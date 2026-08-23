import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth/auth0";
import { fetchProfile } from "@/lib/services/profile";
import ProfileResult from "@/components/auth/profile-result";

export default async function SuccessPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect("/login");
  }

  const { token } = await auth0.getAccessToken();

  let profile;
  try {
    profile = await fetchProfile(token);
  } catch {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Signed in, but couldn&apos;t reach the backend to load your profile.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <ProfileResult profile={profile} />
    </main>
  );
}
