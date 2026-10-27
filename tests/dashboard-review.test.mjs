import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardReviewEnabled } from "../lib/dashboard-review-mode.ts";
test("dashboard review needs an explicit server flag and cannot activate in production", () => {
  const priorFlag = process.env.FARM_DASHBOARD_REVIEW,
    priorEnvironment = process.env.VERCEL_ENV;
  try {
    delete process.env.FARM_DASHBOARD_REVIEW;
    process.env.VERCEL_ENV = "preview";
    assert.equal(dashboardReviewEnabled(), false);
    process.env.FARM_DASHBOARD_REVIEW = "true";
    assert.equal(dashboardReviewEnabled(), true);
    process.env.VERCEL_ENV = "production";
    assert.equal(dashboardReviewEnabled(), false);
    process.env.FARM_DASHBOARD_REVIEW = "false";
    process.env.VERCEL_ENV = "preview";
    assert.equal(dashboardReviewEnabled(), false);
  } finally {
    if (priorFlag === undefined) delete process.env.FARM_DASHBOARD_REVIEW;
    else process.env.FARM_DASHBOARD_REVIEW = priorFlag;
    if (priorEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = priorEnvironment;
  }
});
