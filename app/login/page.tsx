"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";
const authModes: AuthMode[] = ["login", "signup"];

function TerraMark() {
  return (
    <div className="flex items-center justify-center gap-2.5 text-terra-clay">
      <svg aria-hidden className="h-12 w-10" fill="none" viewBox="0 0 40 48">
        <path d="M20 44V5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path
          d="M20 18c-8.5-1.6-12.8-6.2-13-13 8.6.6 13 5 13 13Z"
          fill="currentColor"
          fillOpacity=".13"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M20 27c8.5-1.6 12.8-6.2 13-13-8.6.6-13 5-13 13Z"
          fill="currentColor"
          fillOpacity=".13"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M20 14c-5.5-2.5-7.5-7-6-12 5.8 2.2 7.8 6.2 6 12Z"
          fill="currentColor"
          fillOpacity=".2"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      <span className="font-terra-heading text-[clamp(2.6rem,6vw,3.75rem)] leading-none tracking-[-0.06em]">Terra</span>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden fill="none" viewBox="0 0 24 24">
      <path
        d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.1A10.8 10.8 0 0 1 12 5c7 0 10 7 10 7a18.3 18.3 0 0 1-3.1 4.2M6.2 6.2C3.8 8 2 12 2 12s3 7 10 7a10.8 10.8 0 0 0 3.5-.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg aria-hidden fill="none" viewBox="0 0 24 24">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function chooseMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  function handleModeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? authModes.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + authModes.length) % authModes.length;
    chooseMode(authModes[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setMessage("Check your inbox to confirm your email, then return here to log in.");
        return;
      }

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      router.replace(requestedPath?.startsWith("/") ? requestedPath : "/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach your account. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center p-4 sm:p-8">
      <section
        className="auth-card w-full max-w-[44rem] border border-terra-tan/75 bg-terra-paper px-6 py-10 sm:px-12 sm:py-14"
        aria-labelledby="auth-title"
      >
        <header className="auth-entrance text-center">
          <TerraMark />
          <h1
            className="mt-9 font-terra-heading text-[clamp(2.7rem,7vw,4.45rem)] leading-[.98] tracking-[-0.065em] text-terra-ink"
            id="auth-title"
          >
            {mode === "login" ? "Welcome back" : "Start your journal"}
          </h1>
          <p className="mt-3 text-base text-terra-gray sm:text-lg">
            {mode === "login" ? "to your financial journal." : "A quieter way to know your money."}
          </p>
        </header>

        <div className="mt-10 grid grid-cols-2 border-b border-terra-tan/70" role="tablist" aria-label="Account access">
          {authModes.map((item, index) => (
            <button
              aria-selected={mode === item}
              className={`relative pb-4 text-base font-medium transition-colors sm:text-lg ${mode === item ? "text-terra-clay" : "text-terra-ink hover:text-terra-clay"}`}
              key={item}
              onClick={() => chooseMode(item)}
              onKeyDown={(event) => handleModeKeyDown(event, index)}
              role="tab"
              tabIndex={mode === item ? 0 : -1}
              type="button"
            >
              {item === "login" ? "Log in" : "Sign up"}
              <span
                className={`absolute inset-x-0 bottom-[-1px] h-0.5 origin-center bg-terra-clay transition-transform duration-200 ease-out motion-reduce:transition-none ${mode === item ? "scale-x-100" : "scale-x-0"}`}
              />
            </button>
          ))}
        </div>

        <form className="auth-form mt-9 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-terra-ink" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              className="auth-input"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-terra-ink" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="auth-input pr-14"
                id="password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "login" ? "Enter your password" : "At least 6 characters"}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid w-14 place-items-center text-terra-gray transition-colors hover:text-terra-clay"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                <span className="h-5 w-5">
                  <EyeIcon open={showPassword} />
                </span>
              </button>
            </div>
          </div>

          {mode === "login" && (
            <div className="flex items-center justify-between gap-4 pt-0.5 text-sm">
              <label className="flex cursor-pointer items-center gap-2.5 text-terra-ink">
                <input className="auth-checkbox" defaultChecked type="checkbox" /> Remember me
              </label>
              <span className="text-terra-clay">Secure sign in</span>
            </div>
          )}

          {error && (
            <p
              className="rounded-md border border-terra-brick-line bg-terra-brick-wash px-4 py-3 text-sm text-terra-brick-deep"
              role="alert"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              className="rounded-md border border-terra-sage-line bg-terra-sage-wash px-4 py-3 text-sm text-terra-sage-deep"
              role="status"
            >
              {message}
            </p>
          )}

          <button className="auth-submit w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Just a moment…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="my-9 flex items-center gap-4 text-sm text-terra-gray">
          <span className="h-px flex-1 bg-terra-tan/65" />
          or
          <span className="h-px flex-1 bg-terra-tan/65" />
        </div>
        <p className="text-center text-sm text-terra-gray">
          {mode === "login" ? "New to Terra? " : "Already have an account? "}
          <button
            className="font-medium text-terra-clay transition-colors hover:text-terra-clay-deep"
            onClick={() => chooseMode(mode === "login" ? "signup" : "login")}
            type="button"
          >
            {mode === "login" ? "Sign up here" : "Log in here"}
          </button>
        </p>
      </section>
    </main>
  );
}
