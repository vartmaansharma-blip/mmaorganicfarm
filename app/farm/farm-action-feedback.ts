"use server";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { requireFarmStaff } from "@/lib/farm-dashboard";

export type FarmActionFeedback = { ok: boolean; message: string; revision: number };

// Older farm actions report completion through a same-page redirect. Keep their
// authorization and write paths, but return that feedback without navigating.
export async function performFarmAction(
  action: (data: FormData) => void | Promise<void>,
  pathname: string,
  data: FormData,
): Promise<FarmActionFeedback> {
  if (!/^\/farm(?:\/[a-zA-Z0-9-]+)*$/.test(pathname)) {
    throw new Error("Invalid farm workspace");
  }
  await requireFarmStaff(pathname);
  try {
    await action(data);
    return { ok: true, message: "Saved.", revision: Date.now() };
  } catch (error) {
    if (!isRedirectError(error)) throw error;
    const destination = getURLFromRedirectError(error);
    // Authentication and intentional cross-page transitions remain redirects.
    if (!destination?.startsWith("/") || destination.startsWith("//")) throw error;
    const url = new URL(destination, "https://farm.invalid");
    if (url.pathname !== pathname) throw error;
    if (!["error", "message", "importError", "created"].some(key => url.searchParams.has(key))) throw error;
    const failure = url.searchParams.get("error") ?? url.searchParams.get("importError");
    const message = failure ?? url.searchParams.get("message") ??
      (url.searchParams.has("created")
        ? `Import complete: ${url.searchParams.get("created")} created, ${url.searchParams.get("updated")} updated, ${url.searchParams.get("skipped")} skipped.`
        : "Saved.");
    return { ok: !failure, message, revision: Date.now() };
  }
}
