import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/#milk";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.redirect(
      new URL(
        "/sign-in?message=Customer+accounts+are+being+connected.+Please+try+again+later.",
        requestUrl.origin,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=We+could+not+complete+that+sign-in.", requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/sign-in?error=Your+sign-in+link+expired.+Please+try+again.", requestUrl.origin),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("customer_profiles").upsert(
      {
        user_id: user.id,
        full_name:
          user.user_metadata.full_name ?? user.user_metadata.name ?? null,
        email: user.email ?? null,
        avatar_url:
          user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
      },
      { onConflict: "user_id" },
    );
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ? `https://${forwardedHost}` : requestUrl.origin;
  return NextResponse.redirect(new URL(next, host));
}
