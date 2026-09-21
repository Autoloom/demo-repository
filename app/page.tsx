import { redirect } from "next/navigation";

export default function Home() {
  // Cable OS 3 is the GTP generator alone — there is no dashboard to land on.
  redirect("/gtp");
}
