"use client";
import { FarmForm } from "./farm-form";

import { useActionState, useState } from "react";
import {
  recordCustomerRequest,
  reviewCustomerRequest,
} from "./customer-request-actions";
import styles from "./operations-workbench.module.css";
export function DriverCustomerRequestForm({
  deliveryId,
  tomorrow,
  latest,
}: {
  deliveryId: string;
  tomorrow: string;
  latest: {
    kind: string;
    requested_date: string;
    status: string;
    customer_words: string;
  }[];
}) {
  const [state, action, pending] = useActionState(recordCustomerRequest, null);
  const [key] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(tomorrow);
  const [kind, setKind] = useState("skip_milk");
  const [words, setWords] = useState("");
  return (
    <details className={styles.requestPanel}>
      <summary>Customer asked for a change?</summary>
      <p className={styles.hint}>
        Record a future request in their words. A manager reviews it before the
        delivery plan changes.
      </p>
      {latest.map((r, i) => (
        <p className={styles.saved} key={i}>
          {r.requested_date} · {r.status.replaceAll("_", " ")}
          <br />
          {r.customer_words}
        </p>
      ))}
      <FarmForm action={action} managed feedback={state} className={styles.actionForm}>
        <input type="hidden" name="deliveryId" value={deliveryId} />
        <input type="hidden" name="requestKey" value={key} />
        <fieldset disabled={pending || state?.ok}>
          <legend>Future delivery request</legend>
          <label>
            Requested date
            <input
              name="requestedDate"
              type="date"
              required
              min={tomorrow}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Change requested
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="skip_milk">No milk on this date</option>
              <option value="quantity_change">Change quantity</option>
              <option value="other">Other request</option>
            </select>
          </label>
          <label>
            Customer’s exact request
            <textarea
              name="words"
              required
              minLength={3}
              maxLength={300}
              rows={3}
              placeholder="For example: No milk tomorrow. Please resume the following day."
              value={words}
              onChange={(event) => setWords(event.target.value)}
            />
          </label>
          <button type="submit">
            {pending ? "Saving request…" : "Save customer request"}
          </button>
        </fieldset>
        {state ? (
          <p
            data-farm-feedback
            className={state.ok ? styles.success : styles.error}
            role={state.ok ? "status" : "alert"}
          >
            {state.message ?? state.error}
          </p>
        ) : null}
      </FarmForm>
    </details>
  );
}
export function CustomerRequestReviewForm({
  id,
  kind,
}: {
  id: string;
  kind: string;
}) {
  const [state, action, pending] = useActionState(reviewCustomerRequest, null);
  const [decision, setDecision] = useState(
    kind === "skip_milk" ? "approve" : "follow_up",
  );
  const [note, setNote] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <FarmForm action={action} managed feedback={state} className={styles.actionForm}>
      <input type="hidden" name="requestId" value={id} />
      <input type="hidden" name="requestKey" value={key} />
      <fieldset disabled={pending || state?.ok}>
        <legend>Manager review</legend>
        <p className={styles.hint}>
          {kind === "skip_milk"
            ? "For a verified milk-credit plan, approval skips milk only, keeps other products, and preserves prepaid service. Calendar-month plans need follow-up; released days need a dispatch review."
            : "Review quantities with the customer’s plan. Additional milk requires payment; reduced prepaid milk goes to the next calendar day. Record follow-up here until that change is completed."}
        </p>
        <label>
          Decision
          <select
            name="decision"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          >
            {kind === "skip_milk" ? (
              <option value="approve">Approve and apply milk skip</option>
            ) : null}
            <option value="follow_up">Needs follow-up</option>
            <option value="decline">Decline request</option>
          </select>
        </label>
        <label>
          Decision note
          <textarea
            name="note"
            required
            minLength={3}
            maxLength={300}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button>{pending ? "Saving review…" : "Save review"}</button>
      </fieldset>
      {state ? (
        <p
          data-farm-feedback
          className={state.ok ? styles.success : styles.error}
          role={state.ok ? "status" : "alert"}
        >
          {state.message ?? state.error}
        </p>
      ) : null}
    </FarmForm>
  );
}
