import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="text-4xl" aria-hidden>
        🗺️
      </div>
      <h1 className="text-xl font-semibold">Off the map</h1>
      <p className="text-sm text-muted">That page does not exist.</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Back to the portal
      </Link>
    </main>
  );
}
