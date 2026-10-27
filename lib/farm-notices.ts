import { notificationHref } from "./farm-notifications";
export type FarmNotice = {
  id: string;
  message: string;
  level: "success" | "error";
  href: string;
  created_at: string;
  announce: boolean;
};
export function storedFarmNotices(raw: string | null): FarmNotice[] {
  try {
    const data = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.message === "string" &&
          item.message.length <= 1000 &&
          ["success", "error"].includes(item.level) &&
          typeof item.created_at === "string" &&
          Number.isFinite(Date.parse(item.created_at)),
      )
      .slice(-50)
      .map((item) => ({
        ...item,
        href: notificationHref(String(item.href ?? "")),
        announce: false,
      }));
  } catch {
    return [];
  }
}
