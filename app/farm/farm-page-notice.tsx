"use client";
import { useEffect, useRef } from "react";
import { announceFarmNotice } from "./farm-save-notice";
export function FarmPageNotice({
  message,
  level = "success",
}: {
  message?: string;
  level?: "success" | "error";
}) {
  const sent = useRef("");
  useEffect(() => {
    if (!message) return;
    const signature = level + ":" + message;
    if (sent.current === signature) return;
    const frame = requestAnimationFrame(() => {
      sent.current = signature;
      announceFarmNotice(message, level, true);
    });
    return () => cancelAnimationFrame(frame);
  }, [message, level]);
  return null;
}
