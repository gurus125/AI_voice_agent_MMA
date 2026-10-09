import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Without this check a missing env var crashes middleware with an opaque 500.
    console.error("[middleware] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing at runtime");
    return new NextResponse("Server is missing Supabase configuration (check Vercel environment variables, then redeploy).", { status: 500 });
  }

  // API routes check the user themselves and return their own 401s, so skip a second login check here.
  if (request.nextUrl.pathname.startsWith("/api")) return response;

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getUser() validates the token with Supabase (unlike reading the cookie), so it is safe for access control.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error("[middleware] supabase.auth.getUser failed:", err instanceof Error ? err.message : err);
  }

  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  const isApi = path.startsWith("/api"); // API routes return their own 401s
  const isEmbed = path.startsWith("/embed"); // shows its own "sign in" prompt, since redirects don't work in iframes

  if (!user && !isLogin && !isApi && !isEmbed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}
