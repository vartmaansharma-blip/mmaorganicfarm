"use client";

import { useState, useTransition } from "react";
import { saveDeliveryPin } from "./pin-actions";
import styles from "./delivery-pin.module.css";

type Pin = { latitude: number; longitude: number; accuracy_metres: number };

export function DeliveryPin({ address, saved, available }: {
  address: string;
  saved: Pin | null;
  available: boolean;
}) {
  const [candidate, setCandidate] = useState<Pin | null>(null);
  const [savedHere, setSavedHere] = useState(false);
  const confirmed = Boolean(saved) || savedHere;
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function locate() {
    if (!navigator.geolocation) {
      setMessage("This browser cannot share location. Your written address is still available to the driver.");
      return;
    }
    setLocating(true);
    setCandidate(null);
    setMessage("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      if (!Number.isFinite(coords.accuracy) || coords.accuracy > 100) {
        setMessage("Location is too imprecise. Move near your delivery entrance and try again.");
        return;
      }
      setCandidate({ latitude: coords.latitude, longitude: coords.longitude, accuracy_metres: coords.accuracy });
    }, (error) => {
      setLocating(false);
      setMessage(error.code === 1
        ? "Location permission was declined. Your written address is still available to the driver."
        : "We couldn’t find your location. Please try again near the delivery entrance.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function confirm() {
    if (!candidate) return;
    startTransition(async () => {
      try {
        const result = await saveDeliveryPin({ ...candidate, address });
        setMessage(result.message);
        if (result.ok) { setSavedHere(true); setCandidate(null); }
      } catch {
        setMessage("We couldn’t confirm that the pin was saved. Please try again when connected.");
      }
    });
  }
  return <section className={styles.pin} aria-labelledby="delivery-pin-title" aria-busy={locating || pending}>
    <div><h2 id="delivery-pin-title">Delivery entrance pin</h2>
      <p>{confirmed ? "You have confirmed a GPS destination for this address." : "Help your driver find the right entrance."}</p></div>
    <p>Share location only while you are at the delivery entrance for <strong>{address}</strong>. Check the map before confirming. This saves a destination; it does not track you.</p>
    {!available ? <p role="status">Location saving is currently unavailable. Your written address remains in use.</p> : <>
      <button type="button" disabled={locating || pending} onClick={locate}>{locating ? "Finding your entrance…" : confirmed ? "Update entrance location" : "Use my current location"}</button>
      {candidate ? <div className={styles.review}>
        <p>Reported accuracy: approximately {Math.ceil(candidate.accuracy_metres)} m.</p>
        <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${candidate.latitude},${candidate.longitude}`)}`}>Check this pin on the map ↗</a>
        <button type="button" disabled={pending} onClick={confirm}>{pending ? "Saving entrance…" : "Confirm this is my delivery entrance"}</button>
        <button type="button" disabled={pending} onClick={() => setCandidate(null)}>Discard pin</button>
      </div> : null}
    </>}
    {message ? <p role="status">{message}</p> : null}
    <small>Applies to matching future, unreleased deliveries. An already released route keeps its approved destination. Updating your address clears this pin.</small>
  </section>;
}
