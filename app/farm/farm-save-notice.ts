// Notices follow an actual server response; they do not predict a write.
export function announceFarmNotice(
  message: string,
  level: "success" | "error" = "success",
  announce = false,
) {
  window.dispatchEvent(
    new CustomEvent("farm:notice", {
      detail: {
        message,
        level,
        announce,
        href: window.location.pathname + window.location.search,
      },
    }),
  );
  if (level === "success") window.dispatchEvent(new Event("farm:saved"));
}
export function announceFarmSave(message: string, announce = false) {
  announceFarmNotice(message, "success", announce);
}
