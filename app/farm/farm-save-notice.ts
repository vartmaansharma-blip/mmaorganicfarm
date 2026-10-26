// Visual feedback follows a confirmed server save; it never predicts a write.
export function announceFarmSave(message: string, announce = false) {
  window.dispatchEvent(
    new CustomEvent("farm:saved", { detail: { message, announce } }),
  );
}
