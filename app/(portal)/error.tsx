"use client";

// Never render error.message: server errors are redacted in production and may
// carry internals in development. The digest lets an operator find the log line.
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-danger/40 bg-danger/10 p-6 text-center">
      <h1 className="text-lg font-semibold">Something broke</h1>
      <p className="mt-1 text-sm text-muted">
        The page hit an unexpected error.{error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <button type="button" onClick={reset} className="mt-4 h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg">
        Try again
      </button>
    </div>
  );
}
