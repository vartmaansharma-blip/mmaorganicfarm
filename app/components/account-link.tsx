"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AccountLinkProps = {
  className?: string;
  prefix?: string;
};

export function AccountLink({ className, prefix }: AccountLinkProps) {
  const [account, setAccount] = useState({ href: "/sign-in", label: "Sign in" });

  useEffect(() => {
    const supabase = createClient();

    function updateAccount(user: {
      user_metadata?: { full_name?: string; name?: string };
    } | null) {
      if (!user) {
        setAccount({ href: "/sign-in", label: "Sign in" });
        return;
      }

      const fullName =
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";
      const firstName = fullName.trim().split(/\s+/)[0];
      setAccount({ href: "/account", label: firstName || "Account" });
    }

    supabase.auth.getUser().then(({ data }) => updateAccount(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      updateAccount(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Link className={className} href={account.href}>
      {prefix ? <span>{prefix}</span> : null}
      {account.label}
    </Link>
  );
}
