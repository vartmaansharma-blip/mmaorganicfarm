"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { OutlineIcon } from "./outline-icon";
import styles from "./capsule-navigation.module.css";
export function NavigationMenu({
  homePage = false,
  current: selection,
}: {
  homePage?: boolean;
  current?: string;
}) {
  const pathname = usePathname();
  const current = selection ?? pathname;
  const navigationLinks = [
    { label: "Home", href: homePage ? "#home" : "/#home" },
    { label: "Shop", href: "/shop" },
    { label: "Farm", href: homePage ? "#farm" : "/#farm" },
    { label: "Our Story", href: homePage ? "#about" : "/#about" },
    { label: "My M’ma", href: "/account" },
  ];
  const [menuOpen, setMenuOpen] = useState(false),
    menu = useRef<HTMLDialogElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);
  return (
    <>
      {" "}
      <button
        ref={menuToggle}
        className={styles.menuButton}
        type="button"
        aria-label="Open navigation menu"
        aria-controls="mobile-navigation"
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        onClick={() => {
          menu.current?.showModal();
          setMenuOpen(true);
        }}
      >
        <OutlineIcon name="menu" />
      </button>
      <dialog
        ref={menu}
        id="mobile-navigation"
        className={styles.drawer}
        aria-labelledby="mobile-navigation-title"
        onClose={() => {
          setMenuOpen(false);
          menuToggle.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<
              HTMLAnchorElement | HTMLButtonElement
            >("a[href], button:not([disabled])"),
          );
          if (!controls.length) return;
          const index = controls.findIndex(
            (control) => control === document.activeElement,
          );
          const next = event.shiftKey
            ? index <= 0
              ? controls.length - 1
              : index - 1
            : (index + 1) % controls.length;
          event.preventDefault();
          controls[next]?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            menu.current?.close();
        }}
      >
        <div className={styles.drawerHeader}>
          <p id="mobile-navigation-title">M&apos;ma Organic Farm</p>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => menu.current?.close()}
          >
            Close <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav aria-label="Mobile navigation" className={styles.drawerLinks}>
          {navigationLinks.map(({ label, href }, index) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={href === current ? "location" : undefined}
              onClick={() => menu.current?.close()}
            >
              <small aria-hidden="true">0{index + 1}</small>
              <span>{label}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
        <div className={styles.drawerFooter}>
          <p>
            Discover the farm behind
            <br />
            your everyday milk.
          </p>
          <Link
            href="/shop"
            prefetch={false}
            onClick={() => menu.current?.close()}
          >
            Shop M&apos;ma <span aria-hidden="true">→</span>
          </Link>
        </div>
      </dialog>
    </>
  );
}
