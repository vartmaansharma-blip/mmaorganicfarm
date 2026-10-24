"use client";

import { useEffect } from "react";

type ConversionEvent = "hero_cta_click" | "plan_cta_click" | "whatsapp_click" | "call_click" | "plan_builder_start";
type ConversionPayload = { event: ConversionEvent; location: string };
declare global { interface Window { dataLayer?: Record<string, unknown>[] } }
const allowed = new Set<ConversionEvent>(["hero_cta_click", "plan_cta_click", "whatsapp_click", "call_click"]);

/** No network transport, cookies, identifiers or free-text customer data. */
export function LandingConversionTracking() {
  useEffect(() => {
    const publish = (payload: ConversionPayload) => {
      window.dispatchEvent(new CustomEvent("mma:conversion", { detail: payload }));
      // Forward to an existing integration only; do not silently enable tracking.
      window.dataLayer?.push({ ...payload, source: "mma_landing" });
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-conversion]") : null;
      const name = target?.dataset.conversion as ConversionEvent | undefined;
      if (!target || !name || !allowed.has(name)) return;
      const location = target.dataset.location || "landing";
      publish({ event: name, location });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

/** Rendered only after the authenticated plan page has loaded. */
export function PlanBuilderStartTracking() {
  useEffect(() => {
    const payload: ConversionPayload = { event: "plan_builder_start", location: "milk_plan" };
    window.dispatchEvent(new CustomEvent("mma:conversion", { detail: payload }));
    window.dataLayer?.push({ ...payload, source: "mma_landing" });
  }, []);
  return null;
}
