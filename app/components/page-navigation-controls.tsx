"use client";
import { usePathname } from "next/navigation";
import { CartButton } from "@/app/shop/cart-button";
import { NavigationMenu } from "./navigation-menu";
import { ThemeToggle } from "./theme-toggle";
import styles from "./page-navigation-controls.module.css";
export function PageNavigationControls() {
  const path = usePathname();
  if (
    ["/sign-in", "/forgot-password", "/reset-password"].includes(path) ||
    path.startsWith("/checkout/")
  )
    return null;
  return (
    <div className={styles.controls} data-page-controls>
      <CartButton />
      <ThemeToggle />
      <NavigationMenu />
    </div>
  );
}
