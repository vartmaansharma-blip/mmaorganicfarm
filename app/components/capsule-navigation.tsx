"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CartButton } from "@/app/shop/cart-button";
import { NavigationMenu } from "./navigation-menu";
import { ThemeToggle } from "./theme-toggle";
import styles from "./capsule-navigation.module.css";

const links = [
  { label: "Home", href: "#home" },
  { label: "Shop", href: "/shop" },
  { label: "Farm", href: "#farm" },
  { label: "Our Story", href: "#about" },
  { label: "My M’ma", href: "/account" },
];

export function CapsuleNavigation({
  shopPage = false,
}: {
  shopPage?: boolean;
}) {
  const navigationLinks = links.map((link) => ({
    ...link,
    href: shopPage && link.href.startsWith("#") ? `/${link.href}` : link.href,
  }));
  const [active, setActive] = useState("#home");
  const current = shopPage ? "/shop" : active;
  useEffect(() => {
    const update = () => {
      const farm = document.getElementById("farm");
      const story = document.getElementById("about");
      const threshold = window.innerHeight * 0.45;
      setActive(
        farm && farm.getBoundingClientRect().top < threshold
          ? "#farm"
          : story && story.getBoundingClientRect().top < threshold
            ? "#about"
            : "#home",
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={styles.header}>
      <a
        className={styles.brand}
        href={shopPage ? "/#home" : "#home"}
        aria-label="M'ma Organic Farm home"
      >
        <Image
          src="/mma-logo.png"
          alt="M'ma Organic Farm"
          width={362}
          height={301}
        />
      </a>
      <nav className={styles.capsule} aria-label="Primary navigation">
        {navigationLinks.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={href === current ? "location" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <CartButton />
      <ThemeToggle />
      <NavigationMenu homePage={!shopPage} current={current} />
      <noscript>
        <nav
          className={styles.noScriptNav}
          aria-label="Navigation without JavaScript"
        >
          {navigationLinks.map(({ label, href }) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </noscript>
    </header>
  );
}
