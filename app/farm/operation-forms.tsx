"use client";
import { FarmForm } from "./farm-form";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DELIVERY_REASONS,
  type OperationState,
  type OutcomeItem,
} from "@/lib/delivery-operations";
import {
  saveDeliveryOutcome,
  resolveDeliveryException,
  reviewDeliveryDay,
} from "./operation-actions";
import styles from "./operations-workbench.module.css";
function useSave(
  action: (
    state: OperationState | null,
    form: FormData,
  ) => Promise<OperationState>,
) {
  // Server actions revalidate their pages and return the updated tree.
  const [state, submit, pending] = useActionState(action, null);
  return { state, submit, pending };
}
function Feedback({ state }: { state: OperationState | null }) {
  return state ? (
    <p
      className={state.ok ? styles.success : styles.error}
      role={state.ok ? "status" : "alert"}
    >
      {state.message ?? state.error}
    </p>
  ) : null;
}
export function OperationFilters({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <FarmForm
      className={styles.filters}
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams();
        for (const [key, value] of new FormData(e.currentTarget)) {
          if (String(value).trim()) q.set(key, String(value));
        }
        router.push(`${path}?${q}`, { scroll: false });
      }}
    >
      {children}
      <button type="submit">Apply filters</button>
    </FarmForm>
  );
}
export function DeliveryOutcomeForm({
  deliveryIds,
  items,
  bottlesExpected,
  recorded,
  nextStopId,
}: {
  deliveryIds: string[];
  items: OutcomeItem[];
  bottlesExpected: number;
  recorded: boolean;
  nextStopId?: string;
}) {
  const { state, submit, pending } = useSave(saveDeliveryOutcome);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState("delivered");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [bottles, setBottles] = useState("0");
  const [actual, setActual] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (recorded && !state)
    return (
      <p className={styles.saved}>
        Outcome recorded. Manager review is required for changes.
      </p>
    );
  return (
    <FarmForm action={submit} managed feedback={state} className={styles.actionForm}>
      {deliveryIds.map((id) => (
        <input key={id} name="deliveryId" type="hidden" value={id} />
      ))}
      <input name="requestKey" type="hidden" value={requestKey} />
      <fieldset disabled={pending || state?.ok}>
        <legend>At the doorstep</legend>
        <label>
          Outcome
          <select
            name="outcome"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="delivered">Delivered</option>
            <option value="attempt_failed">Report issue — not delivered</option>
            <option value="partial">Partially delivered</option>
            <option value="reschedule_requested">Request reschedule</option>
          </select>
        </label>
        {mode !== "delivered" ? (
          <>
            <label>
              Issue reason
              <select
                name="reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Choose a reason</option>
                {DELIVERY_REASONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.hint}>
              Record the attempt. Follow approved receiving instructions; do not
              assume permission to leave products unattended. A manager decides
              the resolution.
            </p>
          </>
        ) : null}
        {mode === "partial"
          ? items.map((item) => {
              const key = `${item.delivery_id}:${item.product_key}`;
              return (
                <label key={key}>
                  {item.product_key} actually delivered ({item.unit}; scheduled{" "}
                  {item.quantity})
                  <input name="quantityKey" type="hidden" value={key} />
                  <input
                    name={`actual:${key}`}
                    required
                    type="number"
                    min="0"
                    max={item.quantity}
                    step="0.01"
                    value={actual[key] ?? ""}
                    onChange={(e) =>
                      setActual({ ...actual, [key]: e.target.value })
                    }
                  />
                </label>
              );
            })
          : null}
        {bottlesExpected > 0 ? (
          <label>
            Bottles collected ({bottlesExpected} documented returns due)
            <input
              name="bottlesReturned"
              type="number"
              min="0"
              max={bottlesExpected}
              required
              value={bottles}
              onChange={(e) => setBottles(e.target.value)}
            />
          </label>
        ) : (
          <input name="bottlesReturned" type="hidden" value="0" />
        )}
        <label>
          {reason === "other" ? "Explain the issue" : "Short note (optional)"}
          <textarea
            name="note"
            rows={2}
            required={reason === "other"}
            minLength={reason === "other" ? 3 : undefined}
            maxLength={250}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {!online ? (
          <p role="status" className={styles.error}>
            Offline. Nothing has been saved. Reconnect and submit; your entries
            remain here.
          </p>
        ) : null}
        <button disabled={pending || !online} type="submit">
          {pending
            ? "Saving…"
            : mode === "delivered"
              ? "Save delivered"
              : "Save issue"}
        </button>
      </fieldset>
      <Feedback state={state} />
      {state?.ok && nextStopId ? (
        <a className={styles.nextStop} href={`#${nextStopId}`}>
          Next stop ↓
        </a>
      ) : null}
    </FarmForm>
  );
}
export function ExceptionResolutionForm({
  date,
  visitKey,
  eventId,
}: {
  date: string;
  visitKey: string;
  eventId: string;
}) {
  const { state, submit, pending } = useSave(resolveDeliveryException);
  const [key] = useState(() => crypto.randomUUID());
  const [choice, setChoice] = useState("retain_entitlement");
  const [note, setNote] = useState("");
  const [follow, setFollow] = useState("");
  return (
    <FarmForm action={submit} managed feedback={state} className={styles.actionForm}>
      <input name="date" type="hidden" value={date} />
      <input name="visitKey" type="hidden" value={visitKey} />
      <input name="eventId" type="hidden" value={eventId} />
      <input name="requestKey" type="hidden" value={key} />
      <fieldset disabled={pending || state?.ok}>
        <legend>Manager decision</legend>
        <label>
          Resolution
          <select
            name="resolution"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="retain_entitlement">
              Retain obligation with tracked follow-up
            </option>
            <option value="reschedule">Approve replacement delivery</option>
            <option value="carry_forward">
              Approve legacy milk skip carry-forward
            </option>
            <option value="confirm_delivered">
              Correct to confirmed delivered
            </option>
          </select>
        </label>
        {choice !== "confirm_delivered" ? (
          <label>
            Future {choice === "reschedule" ? "replacement" : "follow-up"} date
            <input
              name="followUp"
              required
              type="date"
              value={follow}
              onChange={(e) => setFollow(e.target.value)}
            />
          </label>
        ) : null}
        <label>
          Decision reason
          <textarea
            name="note"
            rows={2}
            required
            minLength={3}
            maxLength={250}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className={styles.hint}>
          Each choice is validated against the actual obligation. No refund,
          extra charge or purchased-term change is implied.
        </p>
        <button type="submit">
          {pending ? "Saving decision…" : "Save decision"}
        </button>
      </fieldset>
      <Feedback state={state} />
    </FarmForm>
  );
}
export function CloseDayForm({
  date,
  closed,
  blockers,
}: {
  date: string;
  closed: boolean;
  blockers: number;
}) {
  const { state, submit, pending } = useSave(reviewDeliveryDay);
  const [key] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  return (
    <FarmForm action={submit} managed feedback={state} className={styles.actionForm}>
      <input name="date" type="hidden" value={date} />
      <input name="requestKey" type="hidden" value={key} />
      <input
        name="action"
        type="hidden"
        value={closed ? "correction_required" : "closed"}
      />
      <fieldset disabled={pending || state?.ok}>
        <legend>
          {closed ? "Request an audited correction" : "Close operational day"}
        </legend>
        <label>
          {closed
            ? "Why must the day be corrected?"
            : "Closeout note and acknowledged follow-ups"}
          <textarea
            name="note"
            required
            minLength={3}
            maxLength={250}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button disabled={!closed && blockers > 0} type="submit">
          {pending
            ? "Saving…"
            : closed
              ? "Open correction review"
              : "Close day"}
        </button>
      </fieldset>
      <Feedback state={state} />
    </FarmForm>
  );
}
