"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import styles from "./delivery-location.module.css";

const locationKey = "mma-delivery-locality";
const attemptKey = "mma-delivery-location-attempted";
const autoLabel = "Near Jamshedpur";
const detectedLabel = "Current area detected";

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Browsing still works without storage. */ }
}

function detectLocality(
  onResult: (label: string) => void,
  onError: () => void,
) {
  if (!navigator.geolocation) {
    onError();
    return;
  }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    // Broad city hint based on the IMD Jamshedpur reference point. The checkout
    // continues to verify the delivery address against the farm's actual areas.
    const nearJamshedpur = coords.accuracy <= 8_000
      && Math.hypot(coords.latitude - 22.82, (coords.longitude - 86.18) * .92) <= .12;
    onResult(nearJamshedpur ? autoLabel : detectedLabel);
  }, onError, { enableHighAccuracy: false, timeout: 7000, maximumAge: 600_000 });
}

export function DeliveryLocation() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef({ id: 0 });
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  function useDetectedLocation() {
    const request = ++generation.current.id;
    setChecking(true);
    setError("");
    detectLocality(value => {
      if (request !== generation.current.id) return;
      setChecking(false);
      setLabel(value);
      setDraft("");
      save(locationKey, value);
      dialog.current?.close();
    }, () => {
      if (request !== generation.current.id) return;
      setChecking(false);
      setError("Location couldn’t be detected. You can enter your locality below.");
    });
  }

  useEffect(() => {
    const locationRequest = generation.current;
    const timer = window.setTimeout(() => {
      const saved = read(locationKey);
      if (saved) {
        setLabel(saved.slice(0, 60));
        return;
      }
      if (read(attemptKey)) return;
      save(attemptKey, "1");
      const request = ++locationRequest.id;
      detectLocality(value => {
        if (request !== locationRequest.id) return;
        setLabel(value);
        save(locationKey, value);
      }, () => {});
    }, 0);
    return () => {
      window.clearTimeout(timer);
      locationRequest.id++;
    };
  }, []);

  function saveManually(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const locality = draft.trim().replace(/\s+/g, " ");
    if (locality.length < 2 || locality.length > 60) return;
    generation.current.id++;
    setChecking(false);
    setLabel(locality);
    save(locationKey, locality);
    dialog.current?.close();
  }

  return <div className={styles.control} data-delivery-location>
    <button className={styles.trigger} type="button" ref={trigger}
      aria-label={label ? `Change delivery location, ${label}` : "Set delivery location"}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => {
        setDraft(label === autoLabel || label === detectedLabel ? "" : label);
        setError("");
        dialog.current?.showModal();
        setOpen(true);
      }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>
      </svg>
      <span>{label || "Set location"}</span><span aria-hidden="true">⌄</span>
    </button>
    <dialog className={styles.dialog} id={id} ref={dialog} aria-labelledby={`${id}-title`}
      onClose={() => {
        generation.current.id++;
        setChecking(false);
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          dialog.current?.close();
        }
      }}>
      <header className={styles.heading}>
        <h2 id={`${id}-title`}>Delivery location</h2>
        <button type="button" aria-label="Close delivery location" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <p>Choose your area while browsing. Confirm the full address at checkout.</p>
      <button className={styles.detect} type="button" disabled={checking} onClick={useDetectedLocation}>
        {checking ? "Checking location…" : "Use my current location"}
      </button>
      {error ? <p role="status">{error}</p> : null}
      <form onSubmit={saveManually}>
        <label>Town or locality<input value={draft} onChange={event => setDraft(event.target.value)}
          minLength={2} maxLength={60} placeholder="e.g. Bistupur, Jamshedpur" required /></label>
        <button className={styles.save} type="submit">Save location</button>
      </form>
    </dialog>
  </div>;
}
