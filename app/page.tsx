/*  Root / route; redirects users directly to /dashboard. */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
