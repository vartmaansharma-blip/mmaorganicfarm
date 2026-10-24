"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import styles from "./capsule-navigation.module.css";

const links = [
  { label: "Home", href: "#home" },
  { label: "Shop", href: "/milk" },
  { label: "Farm", href: "#farm" },
  { label: "Our Story", href: "#about" },
  { label: "My M’ma", href: "/account" },
];

export function CapsuleNavigation() {
  const [active, setActive] = useState("#home");
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (desktop.matches) menu.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const update = () => {
      const farm = document.getElementById("farm");
      const story = document.getElementById("about");
      const threshold = window.innerHeight * 0.45;
      setActive(farm && farm.getBoundingClientRect().top < threshold ? "#farm" : story && story.getBoundingClientRect().top < threshold ? "#about" : "#home");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={styles.header}>
      <a className={styles.brand} href="#home" aria-label="M'ma Organic Farm home">
        <Image src="/mma-logo.png" alt="M'ma Organic Farm" width={362} height={301} />
      </a>
      <nav className={styles.capsule} aria-label="Primary navigation">
        {links.map(({ label, href }) => (
          <Link key={href} href={href} prefetch={false} aria-current={href === active ? "location" : undefined}>{label}</Link>
        ))}
      </nav>
      <Link className={styles.shop} href="/milk" prefetch={false} data-conversion="plan_cta_click" data-location="header" aria-label="Shop M'ma"><span className={styles.desktopShop}>Shop M&apos;ma</span><span className={styles.mobileShop}>Shop</span> <span aria-hidden="true">→</span></Link>
      <ThemeToggle />
      <button
        ref={menuToggle}
        className={styles.menuButton}
        type="button"
        aria-label="Open navigation menu"
        aria-controls="mobile-navigation"
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        onClick={() => { menu.current?.showModal(); setMenuOpen(true); }}
      >
        <span aria-hidden="true"><i /><i /></span>
      </button>
      <dialog
        ref={menu}
        id="mobile-navigation"
        className={styles.drawer}
        aria-labelledby="mobile-navigation-title"
        onClose={() => { setMenuOpen(false); menuToggle.current?.focus({ preventScroll: true }); }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a[href], button:not([disabled])"));
          if (!controls.length) return;
          const index = controls.findIndex(control => control === document.activeElement);
          const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
          event.preventDefault();
          controls[next]?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) menu.current?.close();
        }}
      >
        <div className={styles.drawerHeader}>
          <p id="mobile-navigation-title">M&apos;ma Organic Farm</p>
          <button type="button" aria-label="Close navigation menu" onClick={() => menu.current?.close()}>Close <span aria-hidden="true">×</span></button>
        </div>
        <nav aria-label="Mobile navigation" className={styles.drawerLinks}>
          {links.map(({ label, href }, index) => (
            <Link key={href} href={href} prefetch={false} aria-current={href === active ? "location" : undefined} onClick={() => menu.current?.close()}>
              <small aria-hidden="true">0{index + 1}</small><span>{label}</span><span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
        <div className={styles.drawerFooter}>
          <p>Discover the farm behind<br />your everyday milk.</p>
          <Link href="/milk" prefetch={false} onClick={() => menu.current?.close()}>Shop M&apos;ma <span aria-hidden="true">→</span></Link>
        </div>
      </dialog>
      <noscript>
        <nav className={styles.noScriptNav} aria-label="Navigation without JavaScript">
          {links.map(({ label, href }) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </noscript>
    </header>
  );
}
