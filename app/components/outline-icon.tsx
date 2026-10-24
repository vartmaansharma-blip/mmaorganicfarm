export function OutlineIcon({
  name,
  size = 22,
}: {
  name: "cart" | "menu" | "milk" | "paneer" | "ghee";
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "cart" ? (
        <>
          <path d="M3 4h2l2.2 11h11.6l2-8H6" />
          <path d="M8 18h10" />
          <circle cx="9" cy="21" r=".8" />
          <circle cx="18" cy="21" r=".8" />
        </>
      ) : name === "menu" ? (
        <>
          <path d="M4 8h16M4 16h16" />
        </>
      ) : name === "milk" ? (
        <>
          <path d="M9 3h6v4l3 4v10H6V11l3-4V3Z" />
          <path d="M9 5h6M6 13h12" />
        </>
      ) : name === "paneer" ? (
        <>
          <path d="m3 11 13-6 5 6v9H3v-9Zm0 0h18" />
          <circle cx="8" cy="15" r="1" />
          <path d="M15 17h2M15 8h1" />
        </>
      ) : (
        <>
          <path d="M6 3h12v4H6zM7 7l-2 3v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10l-2-3" />
          <path d="M5 12h14M5 17h14" />
        </>
      )}
    </svg>
  );
}
