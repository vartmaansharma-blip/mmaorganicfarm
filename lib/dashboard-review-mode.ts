// Server configuration only. A URL or cookie can never enable review access.
export function dashboardReviewEnabled() {
  return (
    process.env.FARM_DASHBOARD_REVIEW === "true" &&
    process.env.VERCEL_ENV !== "production"
  );
}
