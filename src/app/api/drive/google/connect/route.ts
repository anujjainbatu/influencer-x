import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl, getGoogleRedirectUri } from "@/lib/google-drive";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  // State carries the creator's user id; we'll verify it matches the logged-in
  // user on the callback. Sign it with the AES key would be overkill — the
  // callback re-checks the session, so state is just a UX hint here.
  const state = crypto.randomUUID();
  const origin = new URL(request.url).origin;

  const url = buildGoogleAuthUrl({
    state,
    redirectUri: getGoogleRedirectUri(origin),
  });

  const response = NextResponse.redirect(url);
  response.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
