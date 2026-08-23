import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";

export function middleware(request: NextRequest) {
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
