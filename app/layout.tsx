import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cable OS",
  description: "The operating brain for your cable business.",
};

// Other half of the GitHub Pages SPA redirect started in app/not-found.tsx.
// Runs before React hydrates: if a 404 stashed the path the visitor actually
// wanted, rewrite the address bar to it now so the client router (and
// useParams() in routes like quote/[quoteId]) sees the real path instead of
// "/". history.replaceState doesn't trigger a navigation on its own, so this
// only works because Next's router reads location fresh on hydration.
const spaRedirectScript = `
(function () {
  try {
    var target = sessionStorage.getItem("cableos-spa-redirect");
    if (target) {
      sessionStorage.removeItem("cableos-spa-redirect");
      history.replaceState(null, "", target);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: spaRedirectScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
