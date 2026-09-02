import Sidebar from "@/components/layout/sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
