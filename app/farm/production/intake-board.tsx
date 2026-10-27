"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { formatCalendarDate } from "@/lib/delivery-calendar";
import {
  intakeClock,
  intakeHandling,
  intakeLitres,
  type MilkIntake,
  type MilkIntakeWorkspace,
  type IntakeHistory,
} from "@/lib/milk-intake";
import { FarmForm } from "../farm-form";
import { FormSubmitButton } from "../form-submit-button";
import { announceFarmSave } from "../farm-save-notice";
import { PageLinks } from "../workspace-parts";
import {
  saveMilkIntake,
  loadIntakeHistory,
  type IntakeResult,
} from "./actions";
import styles from "./production.module.css";
function ReceiptForm({
  date,
  page,
  record,
  onUpdate,
}: {
  date: string;
  page: number;
  record?: MilkIntake;
  onUpdate: (data: MilkIntakeWorkspace) => void;
}) {
  const request = useRef<{ payload: string; key: string } | null>(null);
  const [received, setReceived] = useState(
      record ? String(record.received_litres) : "",
    ),
    [accepted, setAccepted] = useState(
      record ? String(record.accepted_litres) : "",
    );
  const [state, action, pending] = useActionState(
    async (_: IntakeResult | null, fd: FormData) => {
      const payload = Object.fromEntries(
        Array.from(fd.entries()).map(([k, v]) => [k, String(v)]),
      );
      const signature = JSON.stringify(payload);
      if (request.current?.payload !== signature)
        request.current = { payload: signature, key: crypto.randomUUID() };
      let result: IntakeResult;
      try {
        result = await saveMilkIntake(
          record ? "correct" : "create",
          payload,
          request.current.key,
          date,
          page,
        );
      } catch {
        return {
          ok: false,
          message:
            "The save couldn’t be confirmed. Keep these entries and retry, or refresh to check the receipt.",
        };
      }
      if (result.workspace) onUpdate(result.workspace);
      return result;
    },
    null,
  );
  const remainder =
    received !== "" && accepted !== "" && Number(received) >= Number(accepted)
      ? Number(received) - Number(accepted)
      : null;
  return (
    <FarmForm
      managed
      feedback={state}
      action={action}
      className={styles.form}
      aria-label={
        record ? `Correct receipt ${record.reference}` : "Record milk intake"
      }
    >
      <input type="hidden" name="date" value={date} />
      {record ? (
        <>
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="version" value={record.version} />
        </>
      ) : null}
      <fieldset disabled={pending}>
        <div className={styles.fields}>
          <label>
            Receipt time · IST
            <input
              name="time"
              type="time"
              required
              defaultValue={record ? intakeClock(record.received_at) : ""}
            />
          </label>
          <label>
            Source
            <input
              name="source"
              minLength={2}
              maxLength={100}
              required
              defaultValue={record?.source ?? ""}
              placeholder="Farm collection or supplier"
            />
          </label>
          <label>
            Receipt reference
            <input
              name="reference"
              maxLength={100}
              required
              defaultValue={record?.reference ?? ""}
              placeholder="Collection or batch reference"
            />
          </label>
          <label>
            Received · litres
            <input
              name="received_litres"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
          </label>
          <label>
            Accepted at intake · litres
            <input
              name="accepted_litres"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              required
              value={accepted}
              onChange={(e) => setAccepted(e.target.value)}
            />
          </label>
          <div className={styles.remainder}>
            <span>Rejected / unusable</span>
            <strong>
              {remainder === null ? "—" : intakeLitres(remainder)}{" "}
              <small>L</small>
            </strong>
            <span>Calculated from your measured entries</span>
          </div>
          <label>
            Handling state
            <select
              name="handling"
              required
              defaultValue={record?.handling ?? ""}
            >
              <option value="" disabled>
                Choose the actual state
              </option>
              {Object.entries(intakeHandling).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Storage or holding location
            <input
              name="storage_location"
              minLength={2}
              maxLength={120}
              required
              defaultValue={record?.storage_location ?? ""}
              placeholder="Tank, cooler or segregated area"
            />
          </label>
        </div>
        <label>
          Reason for rejected milk
          {remainder !== null && remainder > 0 ? " · required" : " · if any"}
          <textarea
            name="rejection_reason"
            minLength={remainder !== null && remainder > 0 ? 3 : undefined}
            maxLength={300}
            required={remainder !== null && remainder > 0}
            defaultValue={record?.rejection_reason ?? ""}
          />
        </label>
        <label>
          Quality observations · optional
          <textarea
            name="quality_notes"
            maxLength={500}
            defaultValue={record?.quality_notes ?? ""}
          />
          <small>
            Record test readings and observations only when measured.
          </small>
        </label>
        {record ? (
          <label>
            Reason for correction
            <textarea name="reason" minLength={3} maxLength={300} required />
          </label>
        ) : null}
        <FormSubmitButton>
          {record ? "Save correction" : "Record intake"}
        </FormSubmitButton>
      </fieldset>
    </FarmForm>
  );
}
function VoidReceipt({
  record,
  date,
  page,
  onUpdate,
}: {
  record: MilkIntake;
  date: string;
  page: number;
  onUpdate: (data: MilkIntakeWorkspace) => void;
}) {
  const key = useRef<{ signature: string; id: string } | null>(null);
  const [state, action] = useActionState(
    async (_: IntakeResult | null, fd: FormData) => {
      const payload = {
          id: record.id,
          version: String(record.version),
          reason: String(fd.get("reason") ?? ""),
        },
        signature = JSON.stringify(payload);
      if (key.current?.signature !== signature)
        key.current = { signature, id: crypto.randomUUID() };
      try {
        const result = await saveMilkIntake(
          "void",
          payload,
          key.current.id,
          date,
          page,
        );
        if (result.workspace) {
          announceFarmSave(result.message, true);
          onUpdate(result.workspace);
        }
        return result;
      } catch {
        return {
          ok: false,
          message:
            "The void couldn’t be confirmed. Refresh to review this receipt before retrying.",
        };
      }
    },
    null,
  );
  return (
    <details className={styles.void}>
      <summary>Void this receipt</summary>
      <p>
        Exclude it from intake totals. The original receipt and every correction
        remain in history.
      </p>
      <FarmForm
        managed
        feedback={state}
        action={action}
        aria-label={`Void receipt ${record.reference}`}
      >
        <label>
          Reason for voiding
          <textarea name="reason" required minLength={3} maxLength={300} />
        </label>
        <FormSubmitButton>Void receipt</FormSubmitButton>
      </FarmForm>
    </details>
  );
}
function History({ id }: { id: string }) {
  const [rows, setRows] = useState<IntakeHistory[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [more, setMore] = useState(false);
  async function load(older = false) {
    setPending(true);
    try {
      const result = await loadIntakeHistory(
        id,
        older ? (rows.at(-1)?.version ?? null) : null,
      );
      if (!result.data) {
        setError(result.error ?? "History is unavailable.");
        return;
      }
      setError("");
      setMore(result.data.length > 20);
      setRows((old) =>
        older
          ? [...old, ...result.data!.slice(0, 20)]
          : result.data!.slice(0, 20),
      );
      setLoaded(true);
    } catch {
      setError("History couldn’t be loaded. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <details
      className={styles.history}
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded && !pending) void load();
      }}
    >
      <summary>Receipt history</summary>
      {pending ? <p role="status">Loading evidence…</p> : null}
      {error ? (
        <p role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </p>
      ) : null}
      <ol>
        {rows.map((row) => (
          <li key={row.version}>
            <div>
              <strong>
                {row.action === "create"
                  ? "Intake recorded"
                  : row.action === "correct"
                    ? "Corrected"
                    : "Voided"}
              </strong>
              <span>
                Version {row.version} · {row.actor} ·{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }).format(new Date(row.created_at))}{" "}
                IST
              </span>
            </div>
            {row.reason ? <p>{row.reason}</p> : null}
            <p>
              {row.before_state
                ? `${intakeLitres(row.before_state.accepted_litres)} → `
                : ""}
              {intakeLitres(row.after_state.accepted_litres)} L accepted ·{" "}
              {row.after_state.status}
            </p>
            <details>
              <summary>View the recorded measurements</summary>
              <dl>
                {Object.entries({
                  Source: row.after_state.source,
                  Reference: row.after_state.reference,
                  "Receipt time": `${row.after_state.intake_date} ${intakeClock(row.after_state.received_at)} IST`,
                  Received: `${intakeLitres(row.after_state.received_litres)} L`,
                  Accepted: `${intakeLitres(row.after_state.accepted_litres)} L`,
                  Rejected: `${intakeLitres(row.after_state.rejected_litres)} L`,
                  "Rejection reason": row.after_state.rejection_reason,
                  Handling: intakeHandling[row.after_state.handling],
                  Location: row.after_state.storage_location,
                  Observations: row.after_state.quality_notes,
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </li>
        ))}
      </ol>
      {more ? (
        <button disabled={pending} onClick={() => void load(true)}>
          Load older evidence
        </button>
      ) : null}
    </details>
  );
}
export function IntakeBoard({
  initial,
  today,
}: {
  initial: MilkIntakeWorkspace;
  today: string;
}) {
  const [data, setData] = useState(initial),
    [formNumber, setFormNumber] = useState(0);
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p>FROM THE FARM, CAREFULLY RECORDED</p>
          <h1>
            Every litre
            <br />
            starts here.
          </h1>
          <span>
            Record what arrives, what is accepted and how it is held. Build the
            day on real measurements.
          </span>
        </div>
        <div className={styles.day}>
          <span aria-hidden="true">↘</span>
          <strong>{formatCalendarDate(data.date)}</strong>
          <small>{data.summary.recorded} recorded receipts</small>
        </div>
      </header>
      <div className={styles.toolbar}>
        <FarmForm>
          <label>
            Intake day
            <input
              type="date"
              name="date"
              required
              max={today}
              defaultValue={data.date}
            />
          </label>
          <button>View day</button>
        </FarmForm>
        <Link href="/farm/capacity" prefetch={false}>
          Production capacity ↗
        </Link>
      </div>
      <section className={styles.metrics} aria-label="Measured intake totals">
        {[
          ["Received at farm", data.summary.received],
          ["Accepted at intake", data.summary.accepted],
          ["Rejected / unusable", data.summary.rejected],
        ].map(([label, value]) => (
          <article
            key={label}
            data-attention={
              (label === "Rejected / unusable" && Number(value) > 0) ||
              undefined
            }
          >
            <span>{label}</span>
            <strong>
              {intakeLitres(value)} <small>L</small>
            </strong>
          </article>
        ))}
      </section>
      <p className={styles.scope}>
        These are receipt totals. They do not establish finished stock,
        available-to-sell milk or a food-quality certification.{" "}
        {data.summary.voided
          ? `${data.summary.voided} voided receipts are excluded.`
          : ""}
      </p>
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="record-intake-title">
          <div className={styles.sectionTitle}>
            <div>
              <p>AT THE COLLECTION POINT</p>
              <h2 id="record-intake-title">Record a milk receipt</h2>
            </div>
            <span>Litres · IST</span>
          </div>
          <ReceiptForm
            key={formNumber}
            date={data.date}
            page={data.page}
            onUpdate={setData}
          />
          <button
            className={styles.clear}
            onClick={() => setFormNumber((n) => n + 1)}
          >
            Clear for next receipt
          </button>
        </section>
        <section aria-labelledby="intake-records-title">
          <div className={styles.sectionTitle}>
            <div>
              <p>THE DAY’S PHYSICAL RECORD</p>
              <h2 id="intake-records-title">Milk received</h2>
            </div>
            <span>{data.total} receipts</span>
          </div>
          {!data.records.length ? (
            <div className={styles.empty}>
              <span aria-hidden="true">↘</span>
              <h3>A fresh page for the day.</h3>
              <p>
                No milk receipts are recorded for this date. Add the measured
                intake when it arrives.
              </p>
            </div>
          ) : (
            data.records.map((record) => (
              <article
                className={styles.receipt}
                key={record.id}
                data-voided={record.status === "voided" || undefined}
              >
                <header>
                  <div>
                    <p>
                      {intakeClock(record.received_at)} IST · {record.reference}
                    </p>
                    <h3>{record.source}</h3>
                  </div>
                  <span className={styles.status}>
                    {record.status === "voided" ? "Voided" : "Recorded"}
                  </span>
                </header>
                <dl className={styles.receiptTotals}>
                  <div>
                    <dt>Received</dt>
                    <dd>{intakeLitres(record.received_litres)} L</dd>
                  </div>
                  <div>
                    <dt>Accepted</dt>
                    <dd>{intakeLitres(record.accepted_litres)} L</dd>
                  </div>
                  <div>
                    <dt>Rejected</dt>
                    <dd>{intakeLitres(record.rejected_litres)} L</dd>
                  </div>
                </dl>
                <p className={styles.handling}>
                  {intakeHandling[record.handling]} · {record.storage_location}
                </p>
                {record.rejection_reason ? (
                  <p className={styles.rejection}>{record.rejection_reason}</p>
                ) : null}
                {record.quality_notes ? (
                  <p className={styles.quality}>{record.quality_notes}</p>
                ) : null}
                <p className={styles.recorded}>
                  Recorded by {record.recorded_by_name} · version{" "}
                  {record.version}
                </p>
                {record.status === "recorded" ? (
                  <>
                    <details className={styles.correct}>
                      <summary>Correct this receipt</summary>
                      <p>
                        Keep the receipt’s day. Record a reason and the
                        corrected measurements.
                      </p>
                      <ReceiptForm
                        date={data.date}
                        page={data.page}
                        record={record}
                        onUpdate={setData}
                      />
                    </details>
                    <VoidReceipt
                      record={record}
                      date={data.date}
                      page={data.page}
                      onUpdate={setData}
                    />
                  </>
                ) : null}
                <History key={`history-${record.version}`} id={record.id} />
              </article>
            ))
          )}
          <PageLinks
            path="/farm/production"
            page={data.page}
            hasMore={(data.page + 1) * 50 < data.total}
            query={`date=${data.date}`}
          />
        </section>
      </div>
    </main>
  );
}
