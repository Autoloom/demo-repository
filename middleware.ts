import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";

const LOGIN_PATH = "/login";
const DASHBOARD_PATH = "/dashboard";
const AUTH_PREFIX = "/auth";
const PUBLIC_PATHS = [LOGIN_PATH];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};


export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(AUTH_PREFIX)) {
    return authRes;
  }

  const session = await auth0.getSession(request);
  const signedIn = session !== null;
  const destination = resolveDestination(pathname, signedIn);

  return destination ? redirectTo(destination, request, authRes) : authRes;
}


/** Where the request must be sent instead, or `null` to let it through. */
function resolveDestination(pathname: string, signedIn: boolean) {
  if (pathname === "/") {
    return signedIn ? DASHBOARD_PATH : LOGIN_PATH;
  }

  if (!signedIn && !PUBLIC_PATHS.includes(pathname)) {
    return LOGIN_PATH;
  }

  return null;
}

/**
 * Carries the Auth0 response cookies onto the redirect so a session refreshed
 * by `auth0.middleware` isn't dropped on the way out.
 */
function redirectTo(path: string, request: NextRequest, authRes: NextResponse) {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));

  for (const cookie of authRes.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}
