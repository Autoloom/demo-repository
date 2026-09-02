export default function ComingSoon() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-7 p-6">
      {/* Fades out at both ends so it reads as a rule rather than a border. */}
      <div
        aria-hidden="true"
        className="h-px w-36 bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Coming soon</p>
    </main>
  );
}
