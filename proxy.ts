import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { returnPath } from "@/lib/utils/return-path";

export async function proxy(request: NextRequest) {
  const isLogin = request.nextUrl.pathname === "/login";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return isLogin ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const authHeaders = new Headers();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        const updated = NextResponse.next({ request });
        response.cookies.getAll().forEach((cookie) => updated.cookies.set(cookie));
        cookies.forEach(({ name, value, options }) => updated.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => authHeaders.set(name, value));
        response = updated;
      },
    },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  let destination: URL | undefined;
  if (!user && !isLogin) {
    destination = new URL("/login", request.url);
    destination.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    if (error && error.name === "AuthRetryableFetchError") destination.searchParams.set("service", "unavailable");
  } else if (user && isLogin) {
    destination = new URL(returnPath(request.nextUrl.searchParams.get("next")), request.url);
  }
  if (destination) {
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }
  authHeaders.forEach((value, name) => response.headers.set(name, value));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
