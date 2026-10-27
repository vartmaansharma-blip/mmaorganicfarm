import { dashboardReviewEnabled } from "./lib/dashboard-review-mode";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (dashboardReviewEnabled()) {
    const pathname = request.nextUrl.pathname;
    if (pathname.startsWith("/api/"))
      return NextResponse.json(
        { message: "Dashboard review: sample data only." },
        { status: 403 },
      );
    if (!pathname.startsWith("/farm") && !pathname.startsWith("/_next/"))
      return new NextResponse(null, {
        status: 307,
        headers: { Location: "/farm" },
      });
    const response = NextResponse.next({ request });
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (
    request.nextUrl.pathname === "/" &&
    request.nextUrl.searchParams.has("code")
  ) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    callbackUrl.hash = "";
    return NextResponse.redirect(callbackUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
