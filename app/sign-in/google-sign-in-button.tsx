"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./sign-in.module.css";

type GoogleSignInButtonProps = {
  next: string;
};

export function GoogleSignInButton({ next }: GoogleSignInButtonProps) {
  const started = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  async function startGoogleSignIn() {
    if (started.current) return;

    started.current = true;
    setIsStarting(true);
    setError("");

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", next);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (signInError) {
      started.current = false;
      setIsStarting(false);
      setError("Google sign-in could not start. Please try again.");
    }
  }

  return (
    <div>
      <button
        className={styles.googleButton}
        disabled={isStarting}
        onClick={startGoogleSignIn}
        type="button"
      >
        <Image
          src="/google-g.svg"
          alt=""
          aria-hidden="true"
          width={22}
          height={22}
        />
        {isStarting ? "Opening Google..." : "Continue with Google"}
      </button>
      {error ? (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
