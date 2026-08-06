"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

type Session = {
  accessToken: string;
  user: SupabaseUser;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sessionStorageKey = "mma_delivery_request_session";

function getDisplayName(user: SupabaseUser) {
  return user.user_metadata?.full_name ?? user.user_metadata?.name ?? "";
}

async function fetchUser(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Could not load Google profile.");
  }

  return (await response.json()) as SupabaseUser;
}

export default function DeliveryRequest() {
  const isConfigured = Boolean(supabaseUrl && supabaseKey);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState("");

  const profile = useMemo(() => {
    if (!session?.user) return null;

    return {
      name: getDisplayName(session.user) || "Google account",
      email: session.user.email ?? "",
    };
  }, [session]);

  useEffect(() => {
    if (!isConfigured) return;

    async function loadSession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");

      if (accessToken) {
        window.history.replaceState(null, "", window.location.pathname);
        const user = await fetchUser(accessToken);
        const nextSession = { accessToken, user };
        window.localStorage.setItem(
          sessionStorageKey,
          JSON.stringify(nextSession),
        );
        setSession(nextSession);
        return;
      }

      const saved = window.localStorage.getItem(sessionStorageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved) as Session;
      const user = await fetchUser(parsed.accessToken);
      setSession({ accessToken: parsed.accessToken, user });
    }

    loadSession().catch(() => {
      window.localStorage.removeItem(sessionStorageKey);
      setSession(null);
    });
  }, [isConfigured]);

  function signInWithGoogle() {
    if (!supabaseUrl || !supabaseKey) return;

    const redirectTo = `${window.location.origin}${window.location.pathname}#delivery-request`;
    const params = new URLSearchParams({
      provider: "google",
      redirect_to: redirectTo,
    });

    window.location.href = `${supabaseUrl}/auth/v1/authorize?${params}`;
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabaseUrl || !supabaseKey || !session || !profile) {
      setError("Please continue with Google first.");
      return;
    }

    setStatus("loading");

    const response = await fetch(`${supabaseUrl}/rest/v1/delivery_requests`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: session.user.id,
        name: profile.name,
        email: profile.email,
        phone,
        address,
        status: "new",
      }),
    });

    if (!response.ok) {
      setStatus("idle");
      setError("The request could not be saved. Please check the setup.");
      return;
    }

    setPhone("");
    setAddress("");
    setStatus("sent");
  }

  return (
    <section className="request-section section" id="delivery-request">
      <div className="section-heading request-heading">
        <p className="eyebrow">Digital request</p>
        <h2>
          Request fresh milk
          <br />
          delivery.
        </h2>
        <p>
          Continue with Google so we get your name and email. Then add only your
          phone number and address.
        </p>
      </div>

      <div className="request-card">
        <div className="request-steps" aria-label="Request steps">
          <span>Google</span>
          <span>Phone</span>
          <span>Address</span>
          <span>Submit</span>
        </div>

        {!isConfigured ? (
          <div className="request-empty">
            <h3>Digital request flow preview</h3>
            <p>
              This is where visitors will continue with Google, add phone and
              address, and send a delivery request once the secure connection is
              switched on.
            </p>
          </div>
        ) : !session || !profile ? (
          <div className="request-auth">
            <h3>Start with your Google account</h3>
            <p>Name and email come from Google. No extra account form is needed.</p>
            <button className="button button-dark" type="button" onClick={signInWithGoogle}>
              Continue with Google <span>↗</span>
            </button>
          </div>
        ) : (
          <form className="request-form" onSubmit={submitRequest}>
            <div className="profile-preview">
              <span>Signed in as</span>
              <strong>{profile.name}</strong>
              <small>{profile.email}</small>
            </div>

            <label>
              Phone number
              <input
                autoComplete="tel"
                inputMode="tel"
                minLength={7}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91"
                required
                type="tel"
                value={phone}
              />
            </label>

            <label>
              Address
              <textarea
                autoComplete="street-address"
                minLength={8}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="House, apartment, street, landmark"
                required
                rows={4}
                value={address}
              />
            </label>

            {error && <p className="request-error">{error}</p>}
            {status === "sent" && (
              <p className="request-success">
                Request received. M&apos;ma Organic Farm will contact you to
                confirm availability and plan delivery.
              </p>
            )}

            <button className="button button-dark" disabled={status === "loading"} type="submit">
              {status === "loading" ? "Sending..." : "Send delivery request"}
              <span>↗</span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
