import { NextResponse, type NextRequest } from "next/server";
import {
  decodeIdTokenEmail,
  exchangeCodeForTokens,
  getGoogleRedirectUri,
} from "@/lib/google-drive";
import { encryptString } from "@/lib/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("g_oauth_state")?.value;
  const err = url.searchParams.get("error");

  if (err || !code) {
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(err ?? "missing_code")}`, request.url));
  }
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL("/connect?error=state_mismatch", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri: getGoogleRedirectUri(url.origin),
    });

    if (!tokens.refresh_token) {
      // No refresh token returned — usually because the user has previously
      // consented and Google didn't re-issue one. We forced prompt=consent on
      // /connect to avoid this, but treat as recoverable error.
      return NextResponse.redirect(new URL("/connect?error=no_refresh_token", request.url));
    }

    const refreshEnc = await encryptString(tokens.refresh_token);
    const accessEnc = await encryptString(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const email = decodeIdTokenEmail(tokens.id_token);

    // Upsert connection
    const { error: upsertError } = await supabase
      .from("drive_connections")
      .upsert(
        {
          user_id: user.id,
          provider: "google",
          refresh_token_encrypted: refreshEnc,
          access_token_encrypted: accessEnc,
          access_token_expires_at: expiresAt,
          account_email: email,
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      return NextResponse.redirect(
        new URL(`/connect?error=${encodeURIComponent(upsertError.message)}`, request.url)
      );
    }

    const response = NextResponse.redirect(new URL("/upload", request.url));
    response.cookies.delete("g_oauth_state");
    return response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(msg)}`, request.url));
  }
}
