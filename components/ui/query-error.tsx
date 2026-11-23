import Link from "next/link";

export function QueryError({ error, message, retry }: { error: unknown; message: string; retry: () => void }) {
  const details = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const expired = /jwt expired|session.*(expired|ended|missing)|not authenticated/i.test(details);
  const offline = /fetch|network|connection|load failed|timeout/i.test(details);
  return (
    <div
      role="alert"
      className="rounded-xl border border-terra-brick-line bg-terra-brick-wash px-5 py-4 text-sm text-terra-brick-deep"
    >
      {expired ? "Your session has ended. " : offline ? "Terra could not connect. " : message + " "}
      {expired ? (
        <Link href="/login" className="underline">
          Sign in again
        </Link>
      ) : (
        <button type="button" className="underline" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}
