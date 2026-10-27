import { NextRequest, NextResponse } from "next/server";
import { dashboardReviewEnabled } from "@/lib/dashboard-review-mode";
export async function GET(request: NextRequest) {
  if (!dashboardReviewEnabled()) return new NextResponse(null, { status: 404 });
  const input = request.nextUrl.searchParams.get("role");
  const role = input === "driver" || input === "manager" ? input : "admin";
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: role === "driver" ? "/farm/runs" : "/farm" },
  });
  response.cookies.set("mma-dashboard-review-role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/farm",
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
