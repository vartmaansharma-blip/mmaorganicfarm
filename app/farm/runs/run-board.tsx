"use client";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { announceFarmSave, announceFarmNotice } from "../farm-save-notice";
import { formatCalendarDate, productName } from "@/lib/delivery-calendar";
import {
  journeyDistance,
  journeyMinutes,
  quantityLabel,
  runHint,
  runStatus,
  type DriverRun,
  type Quantities,
  type RunWorkspace,
} from "@/lib/driver-runs";
import { saveRunOperation, type RunActionResult } from "./actions";
import styles from "./runs.module.css";
type Update = (workspace: RunWorkspace) => void;
function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={styles.primary}
      disabled={pending}
      aria-busy={pending}
      data-pending={pending || undefined}
      type="submit"
    >
      {pending ? "Saving…" : children}
      <span aria-hidden="true">{pending ? "…" : "↗"}</span>
    </button>
  );
}
function Operation({
  action,
  base = {},
  date,
  onUpdate,
  children,
  label,
  build,
  disabled = false,
}: {
  action: string;
  base?: Record<string, unknown>;
  date: string;
  onUpdate: Update;
  children?: ReactNode;
  label: string;
  build?: (fd: FormData) => Record<string, unknown>;
  disabled?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const lastSaveSucceeded = useRef(false);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const [state, perform, pending] = useActionState(
    async (_: RunActionResult, fd: FormData) => {
      lastSaveSucceeded.current = false;
      const payload = {
        ...base,
        ...(build ? build(fd) : Object.fromEntries(fd.entries())),
      };
      const signature = JSON.stringify(payload);
      if (request.current?.payload !== signature)
        request.current = { payload: signature, key: crypto.randomUUID() };
      let result: RunActionResult;
      try {
        result = await saveRunOperation(
          action,
          payload,
          request.current.key,
          date,
        );
      } catch {
        result = {
          ok: false,
          message:
            "We couldn’t confirm the save. Keep these entries and retry, or refresh to check the run.",
        };
      }
      lastSaveSucceeded.current = result.ok;
      if (result.ok && form.current) delete form.current.dataset.farmDirty;
      if (result.workspace) onUpdate(result.workspace);
      else if (result.ok) announceFarmSave(result.message, true);
      else announceFarmNotice(result.message, "error");
      return result;
    },
    { ok: false, message: "" },
  );
  return (
    <form
      ref={form}
      action={perform}
      data-farm-pending={String(pending)}
      aria-busy={pending}
      onInput={(event) => {
        event.currentTarget.dataset.farmDirty = "true";
      }}
      onChange={(event) => {
        event.currentTarget.dataset.farmDirty = "true";
      }}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className={styles.form}
      aria-label={label}
      onReset={(event) => {
        if (!lastSaveSucceeded.current) event.preventDefault();
      }}
    >
      <fieldset disabled={pending || !online || disabled}>
        {children}
        <Submit>{label}</Submit>
      </fieldset>
      {!online ? (
        <p className={styles.error} role="status">
          You’re offline. Reconnect before saving; your entries are still here.
        </p>
      ) : null}
      {state.message ? (
        <p
          data-farm-feedback
          className={state.ok ? styles.feedback : styles.error}
          role={state.ok ? undefined : "alert"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
function Totals({
  quantities,
  label,
}: {
  quantities: Quantities;
  label: string;
}) {
  return (
    <dl className={styles.quantities} aria-label={label}>
      {Object.entries(quantities).map(([product, qty]) => (
        <div key={product}>
          <dt>{productName(product)}</dt>
          <dd>{quantityLabel(product, Number(qty))}</dd>
        </div>
      ))}
    </dl>
  );
}
function QuantityInputs({
  quantities,
  prefix,
  defaults,
}: {
  quantities: Quantities;
  prefix: string;
  defaults?: Quantities;
}) {
  return (
    <div className={styles.fields}>
      {Object.keys(quantities).map((product) => (
        <label key={product}>
          {productName(product)} ·{" "}
          {product === "milk" ? "litres" : "500 g packs"}
          <input
            type="number"
            inputMode="decimal"
            name={`${prefix}_${product}`}
            min="0"
            step={product === "milk" ? "0.01" : "1"}
            defaultValue={defaults?.[product] ?? ""}
            required
          />
        </label>
      ))}
    </div>
  );
}
function readQuantities(fd: FormData, quantities: Quantities, prefix: string) {
  return Object.fromEntries(
    Object.keys(quantities).map((p) => [p, Number(fd.get(`${prefix}_${p}`))]),
  );
}
function Progress({ status }: { status: string }) {
  const stages = [
    "Prepared",
    "Load checked",
    "Released",
    "On the road",
    "Returned",
  ];
  const index =
    (
      {
        loading: 0,
        awaiting_ack: 0,
        acknowledged: 1,
        released: 2,
        in_progress: 3,
        returned: 4,
        closed: 5,
      } as Record<string, number>
    )[status] ?? -1;
  if (index < 0) return null;
  return (
    <ol className={styles.progress} aria-label="Run progress">
      {stages.map((s, i) => (
        <li
          key={s}
          data-complete={i < index || undefined}
          aria-current={i === Math.min(index, 4) ? "step" : undefined}
        >
          <span aria-hidden="true">
            {i < index ? "✓" : String(i + 1).padStart(2, "0")}
          </span>
          <small>{s}</small>
        </li>
      ))}
    </ol>
  );
}
function RunCard({
  run,
  driver,
  date,
  onUpdate,
}: {
  run: DriverRun;
  driver: boolean;
  date: string;
  onUpdate: Update;
}) {
  const body = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(run.status);
  useEffect(() => {
    if (previousStatus.current === run.status) return;
    previousStatus.current = run.status;
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      // Safari may keep focus on the skip-link destination after a pointer
      // submission. Both neutral containers should yield to the next phase.
      if (focused === document.body || focused?.id === "farm-workspace")
        body.current
          ?.querySelector<HTMLElement>("h3")
          ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [run.status]);
  const base = { id: run.id, version: run.version };
  const distance = journeyDistance(run),
    minutes = journeyMinutes(run);
  const routeHref = `/farm/delivery-sheet?${new URLSearchParams({ date, route: run.route_id })}`;
  return (
    <article
      className={styles.run}
      data-state={run.status}
      aria-label={`${run.route_name} run`}
    >
      <header className={styles.runHeading}>
        <div>
          <p className={styles.eyebrow}>
            {driver ? "Your delivery run" : "Daily delivery run"}
          </p>
          <h2>{run.route_name}</h2>
          <span>
            {driver ? "" : `${run.driver_name} · `}
            {run.vehicle_name} · {run.registration}
          </span>
        </div>
        <span className={styles.status}>{runStatus[run.status]}</span>
      </header>
      <Progress status={run.status} />
      <div key={run.status} ref={body} className={styles.runBody}>
        <div className={styles.brief}>
          <h3 tabIndex={-1}>
            {driver
              ? ((
                  {
                    awaiting_ack: "A quick check before you go",
                    released: "Ready when you are",
                    in_progress: "Good things, on their way",
                    returned: "Back at the farm",
                    closed: "A day well delivered",
                  } as Record<string, string>
                )[run.status] ?? "Let’s get you ready")
              : (
                  {
                    loading: "Pack with confidence",
                    awaiting_ack: "Ready for the driver’s check",
                    acknowledged: "Checked and ready to release",
                    released: "Ready for the road",
                    in_progress: "Deliveries are under way",
                    returned: "Bring the day into balance",
                    closed: "Every quantity accounted for",
                    cancelled: "Run cancelled",
                  } as Record<string, string>
                )[run.status]}
          </h3>
          <p>{runHint[run.status]}</p>
        </div>
        <div className={styles.stats}>
          <div>
            <strong>{run.stop_count}</strong>
            <span>Doorstep visits</span>
          </div>
          <div>
            <strong>
              {run.recorded_stops}
              <small> / {run.stop_count}</small>
            </strong>
            <span>Outcomes recorded</span>
          </div>
          {distance !== null ? (
            <div>
              <strong>
                {distance}
                <small> km</small>
              </strong>
              <span>Odometer · reported</span>
            </div>
          ) : null}
          {minutes !== null ? (
            <div>
              <strong>
                {minutes}
                <small> min</small>
              </strong>
              <span>Start to return · includes stops</span>
            </div>
          ) : null}
        </div>
        <section className={styles.load}>
          <div className={styles.sectionHeading}>
            <h3>
              {Object.keys(run.load).length
                ? "Recorded load"
                : "Planned quantities"}
            </h3>
            <span>
              {Object.keys(run.load).length
                ? "Physically entered at loading"
                : "Check against the physical load"}
            </span>
          </div>
          <Totals
            quantities={Object.keys(run.load).length ? run.load : run.planned}
            label="Product quantities"
          />
        </section>
        {run.return_note ? (
          <p className={styles.note}>
            <strong>Run note</strong>
            {run.return_note}
          </p>
        ) : null}
        {!driver &&
        ["loading", "awaiting_ack", "acknowledged"].includes(run.status) ? (
          <div className={styles.actionPanel}>
            <Operation
              key={`load-${run.version}`}
              action="load"
              base={base}
              date={date}
              onUpdate={onUpdate}
              label={
                run.status === "loading"
                  ? "Save physical load"
                  : "Update physical load"
              }
              build={(fd) => ({
                load: readQuantities(fd, run.planned, "load"),
              })}
            >
              <p className={styles.helper}>
                Planned:{" "}
                {Object.entries(run.planned)
                  .map(
                    ([p, q]) =>
                      `${productName(p)} ${quantityLabel(p, Number(q))}`,
                  )
                  .join(" · ")}
                . Enter the actual quantities placed in the vehicle.
              </p>
              <QuantityInputs
                quantities={run.planned}
                prefix="load"
                defaults={Object.keys(run.load).length ? run.load : undefined}
              />
            </Operation>
          </div>
        ) : null}
        {driver && run.status === "awaiting_ack" ? (
          <div className={styles.actionPanel}>
            <Operation
              action="acknowledge"
              base={base}
              date={date}
              onUpdate={onUpdate}
              label="Accept this load"
            >
              <label className={styles.check}>
                <input type="checkbox" required name="checked" value="yes" />
                <span>
                  I counted the products and these quantities match my load.
                </span>
              </label>
            </Operation>
            <details>
              <summary>Something doesn’t match?</summary>
              <Operation
                action="reject_load"
                base={base}
                date={date}
                onUpdate={onUpdate}
                label="Ask manager to correct load"
              >
                <label>
                  What needs correcting?
                  <textarea
                    name="note"
                    minLength={3}
                    maxLength={250}
                    required
                  />
                </label>
              </Operation>
            </details>
          </div>
        ) : null}
        {!driver && run.status === "acknowledged" ? (
          <Operation
            action="release"
            base={base}
            date={date}
            onUpdate={onUpdate}
            label="Release this run"
          >
            <p className={styles.helper}>
              The driver checked the load. Release also runs the day’s dispatch
              readiness checks.
            </p>
          </Operation>
        ) : null}
        {driver && run.status === "released" ? (
          <Operation
            action="start"
            base={base}
            date={date}
            onUpdate={onUpdate}
            label="Start my run"
          >
            <label>
              Opening odometer · km
              <input
                name="odometer"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                required
                placeholder="Reading on your vehicle"
              />
            </label>
            <p className={styles.helper}>
              Start when you leave the farm. The journey clock begins when you
              save.
            </p>
          </Operation>
        ) : null}
        {run.status === "in_progress" ? (
          <>
            <Link prefetch={false} className={styles.primary} href={routeHref}>
              {driver ? "Open my delivery stops" : "View delivery outcomes"}
              <span aria-hidden="true">↗</span>
            </Link>
            {driver ? (
              <details className={styles.returnPanel}>
                <summary>Back at the farm? Finish your run</summary>
                <Operation
                  action="finish"
                  base={base}
                  date={date}
                  onUpdate={onUpdate}
                  label="Record return to farm"
                >
                  <label>
                    Closing odometer · km
                    <input
                      name="odometer"
                      type="number"
                      inputMode="decimal"
                      min={Number(run.opening_odometer)}
                      step="0.1"
                      required
                    />
                  </label>
                  <label>
                    Return note · required for unrecorded stops
                    <textarea name="note" maxLength={250} />
                  </label>
                  <p className={styles.helper}>
                    The journey clock stops when you save. Stock still needs
                    manager closeout.
                  </p>
                </Operation>
              </details>
            ) : null}
          </>
        ) : null}
        {!driver && run.status === "returned" ? (
          <div className={styles.actionPanel}>
            <Totals quantities={run.delivered} label="Delivered quantities" />
            <Operation
              action="close"
              base={base}
              date={date}
              onUpdate={onUpdate}
              label="Review and close run"
              build={(fd) => ({
                returns: readQuantities(fd, run.load, "returned"),
                losses: readQuantities(fd, run.load, "lost"),
                note: String(fd.get("note") ?? ""),
              })}
            >
              <h3>Stock returned to the farm</h3>
              <QuantityInputs quantities={run.load} prefix="returned" />
              <h3>Lost or spoiled stock</h3>
              <QuantityInputs quantities={run.load} prefix="lost" />
              <label>
                Closeout note · explain any loss
                <textarea name="note" maxLength={250} />
              </label>
              <p className={styles.helper}>
                Loaded stock must equal delivered + returned + lost. All stops
                need a recorded outcome.
              </p>
            </Operation>
            <Link prefetch={false} className={styles.textLink} href={routeHref}>
              Review outstanding stops ↗
            </Link>
          </div>
        ) : null}
        {run.status === "closed" && run.closeout ? (
          <div className={styles.closed}>
            <span className={styles.seal} aria-hidden="true">
              ✓
            </span>
            <div>
              <h3>Stock reconciled</h3>
              <p>
                Returned:{" "}
                {Object.entries(run.closeout.returns)
                  .map(
                    ([p, q]) =>
                      `${productName(p)} ${quantityLabel(p, Number(q))}`,
                  )
                  .join(" · ")}
              </p>
              <p>
                Lost / spoiled:{" "}
                {Object.entries(run.closeout.losses)
                  .map(
                    ([p, q]) =>
                      `${productName(p)} ${quantityLabel(p, Number(q))}`,
                  )
                  .join(" · ")}
              </p>
              {run.closeout.note ? <p>{run.closeout.note}</p> : null}
            </div>
          </div>
        ) : null}
        {driver &&
        ["loading", "acknowledged", "returned"].includes(run.status) ? (
          <p className={styles.waiting}>
            <span aria-hidden="true">◷</span>
            {run.status === "loading"
              ? "Your manager is preparing the load."
              : run.status === "acknowledged"
                ? "Load accepted. Your manager will release the run next."
                : "Your manager will review the stock and close this run."}{" "}
            <a href={`/farm/runs?date=${date}`}>Refresh status</a>
          </p>
        ) : null}
        {!driver && ["released", "in_progress"].includes(run.status) ? (
          <p className={styles.waiting}>
            {run.status === "released"
              ? "Waiting for the driver to start the journey."
              : "The driver is recording deliveries. Refresh for the latest outcomes."}
          </p>
        ) : null}
        {!driver &&
        !["in_progress", "returned", "closed", "cancelled"].includes(
          run.status,
        ) ? (
          <details className={styles.secondaryActions}>
            <summary>Manifest and run controls</summary>
            <p>Changes to stops require a fresh load check.</p>
            {run.status !== "released" ? (
              <Operation
                action="refresh"
                base={base}
                date={date}
                onUpdate={onUpdate}
                label="Refresh manifest and reset load"
              />
            ) : null}
            <Operation
              action="cancel"
              base={base}
              date={date}
              onUpdate={onUpdate}
              label="Cancel this run"
            >
              <label>
                Cancellation reason
                <textarea name="note" minLength={3} maxLength={250} required />
              </label>
              <p className={styles.helper}>
                Deliveries remain on the dispatch board for reassignment.
              </p>
            </Operation>
          </details>
        ) : null}
        {run.manifest.length && !driver ? (
          <details className={styles.manifest}>
            <summary>
              {run.stop_count} {run.stop_count === 1 ? "stop" : "stops"} on this
              manifest
            </summary>
            <ol>
              {run.manifest.map((stop) => (
                <li key={stop.id}>
                  <div>
                    <strong>{stop.customer_name}</strong>
                    <p>{stop.address_snapshot}</p>
                  </div>
                  <span>
                    {stop.items
                      .map(
                        (i) =>
                          `${productName(i.product_key)} ${quantityLabel(i.product_key, i.quantity)}`,
                      )
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </article>
  );
}
export function RunBoard({ initial }: { initial: RunWorkspace }) {
  const [data, setData] = useState(initial);
  const [section, setSection] = useState("runs");
  const driver = data.role === "driver";
  const currentRuns = data.runs.filter((r) => r.status !== "cancelled");
  const confirmedDrivers = data.drivers.filter(
    (d) => d.active && d.available && d.phone,
  );
  const activeVehicles = data.vehicles.filter((v) => v.active);
  const unassignedRoutes = data.routes.filter(
    (r) => r.stops > 0 && !currentRuns.some((run) => run.route_id === r.id),
  );
  const canCreateRun =
    confirmedDrivers.length > 0 &&
    activeVehicles.length > 0 &&
    unassignedRoutes.length > 0;
  const update: Update = (workspace) => {
    const changed = workspace.runs.find(
      (run) =>
        data.runs.find((previous) => previous.id === run.id)?.version !==
        run.version,
    );
    setData(workspace);
    announceFarmSave(
      changed
        ? `${changed.route_name} · ${runStatus[changed.status]}`
        : "Saved. Your workday is up to date.",
      true,
    );
  };
  return (
    <main
      className={styles.page}
      data-driver={driver || undefined}
      data-has-run={currentRuns.length > 0 || undefined}
    >
      <section className={styles.welcome}>
        <div>
          <p>{driver ? "M’ma delivery team" : "From our farm, with care"}</p>
          <h1>
            {driver
              ? currentRuns.length
                ? "Your day, in motion."
                : "A good day,\none doorstep at a time."
              : "Ready for\na smooth morning."}
          </h1>
          <span>
            {driver
              ? "Your load, your journey, your next step. All in one place."
              : "Bring the team, the load and the route together before anyone leaves."}
          </span>
        </div>
        <div className={styles.dayMark}>
          <span aria-hidden="true">↗</span>
          <strong>{formatCalendarDate(data.date)}</strong>
          <small>
            {driver
              ? "Drive with care. Deliver with care."
              : `${currentRuns.length} ${currentRuns.length === 1 ? "run" : "runs"} · ${currentRuns.filter((r) => r.status === "closed").length} closed`}
          </small>
        </div>
      </section>
      <div className={styles.toolbar}>
        <form method="get" className={styles.dateForm}>
          <label>
            Service day
            <input name="date" type="date" defaultValue={data.date} required />
          </label>
          <button>View day</button>
        </form>
        <Link
          prefetch={false}
          href={`/farm/${driver ? "delivery-sheet" : "routes"}?date=${data.date}`}
          className={styles.textLink}
        >
          {driver ? "Delivery sheet" : "Dispatch board"} ↗
        </Link>
        <a href={`/farm/runs?date=${data.date}`} className={styles.textLink}>
          Refresh
        </a>
      </div>
      {!driver ? (
        <nav className={styles.tabs} aria-label="Run workspace">
          {[
            ["runs", "Delivery runs"],
            ["team", "Driver team"],
            ["vehicles", "Vehicles"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              onClick={() => setSection(id)}
            >
              {label}
              {id === "runs" ? <span>{currentRuns.length}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}
      {section === "runs" ? (
        <>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>
                {driver ? "Your workday" : "Today’s movement"}
              </p>
              <h2>{driver ? "Let’s get you on your way" : "Delivery runs"}</h2>
            </div>
            {!driver ? (
              <a className={styles.textLink} href="#prepare-run">
                Prepare a run ↓
              </a>
            ) : null}
          </div>
          <div className={styles.runList}>
            {data.runs.length ? (
              data.runs.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  driver={driver}
                  date={data.date}
                  onUpdate={update}
                />
              ))
            ) : (
              <section className={styles.empty}>
                <span className={styles.seal} aria-hidden="true">
                  ↗
                </span>
                <h2>
                  {driver
                    ? "A little breathing room"
                    : "The day is yours to prepare"}
                </h2>
                <p>
                  {driver
                    ? "No delivery run is assigned for this day. Confirm your availability below and check with your manager."
                    : "Prepare dispatch, confirm the driver and vehicle, then record the physical load."}
                </p>
              </section>
            )}
          </div>
          {!driver ? (
            <section className={styles.setup} id="prepare-run">
              <div>
                <p className={styles.eyebrow}>Before the first doorstep</p>
                <h2>Prepare a delivery run</h2>
                <p>
                  Use a prepared route. The driver’s availability and vehicle
                  capacity are checked before release.
                </p>
              </div>
              {!canCreateRun && currentRuns.length === 0 ? (
                <>
                  <p className={styles.helper}>
                    Complete these preparation steps before creating a run.
                  </p>
                  <ol
                    className={styles.preparation}
                    aria-label="Run preparation checklist"
                  >
                    <li data-ready={confirmedDrivers.length > 0 || undefined}>
                      <span className={styles.stepMark} aria-hidden="true">
                        {confirmedDrivers.length ? "✓" : "01"}
                      </span>
                      <div>
                        <h3>Confirm the driver</h3>
                        <p>
                          {confirmedDrivers.length
                            ? "Contact details and availability are recorded."
                            : "Save a contact number and confirm availability for this service day."}
                        </p>
                      </div>
                      <button type="button" onClick={() => setSection("team")}>
                        Set up driver <span aria-hidden="true">↗</span>
                      </button>
                    </li>
                    <li data-ready={activeVehicles.length > 0 || undefined}>
                      <span className={styles.stepMark} aria-hidden="true">
                        {activeVehicles.length ? "✓" : "02"}
                      </span>
                      <div>
                        <h3>Choose a vehicle</h3>
                        <p>
                          {activeVehicles.length
                            ? "An active vehicle is available to select."
                            : "Add the registration and actual product carrying limits."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSection("vehicles")}
                      >
                        Set up vehicle <span aria-hidden="true">↗</span>
                      </button>
                    </li>
                    <li data-ready={unassignedRoutes.length > 0 || undefined}>
                      <span className={styles.stepMark} aria-hidden="true">
                        {unassignedRoutes.length ? "✓" : "03"}
                      </span>
                      <div>
                        <h3>Prepare the route</h3>
                        <p>
                          {unassignedRoutes.length
                            ? "A route has pending stops and no run assigned."
                            : "Prepare this day's dispatch and resolve route assignments."}
                        </p>
                      </div>
                      <Link
                        prefetch={false}
                        href={`/farm/routes?date=${data.date}`}
                      >
                        Open dispatch board <span aria-hidden="true">↗</span>
                      </Link>
                    </li>
                  </ol>
                </>
              ) : null}
              {!canCreateRun && currentRuns.length > 0 ? (
                <p className={styles.helper}>
                  To add another run, you need an unassigned route with pending
                  stops, a confirmed driver and an active vehicle.
                </p>
              ) : null}
              <Operation
                disabled={!canCreateRun}
                action="create"
                base={{ date: data.date }}
                date={data.date}
                onUpdate={update}
                label="Create delivery run"
              >
                <div className={styles.fields}>
                  <label>
                    Prepared route
                    <select name="route_id" required defaultValue="">
                      <option value="" disabled>
                        Choose a route
                      </option>
                      {unassignedRoutes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {r.stops} stops
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Available driver
                    <select
                      name="driver_id"
                      required
                      defaultValue=""
                      onChange={(event) => {
                        const preferred = data.drivers.find(
                          (d) => d.id === event.currentTarget.value,
                        )?.default_vehicle_id;
                        const control =
                          event.currentTarget.form?.elements.namedItem(
                            "vehicle_id",
                          );
                        if (preferred && control instanceof HTMLSelectElement)
                          control.value = preferred;
                      }}
                    >
                      <option value="" disabled>
                        Choose a driver
                      </option>
                      {confirmedDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vehicle
                    <select name="vehicle_id" required defaultValue="">
                      <option value="" disabled>
                        Choose a vehicle
                      </option>
                      {activeVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.registration}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Operation>
            </section>
          ) : null}
        </>
      ) : null}
      {section === "team" || driver ? (
        <section className={styles.team}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>
                {driver ? "Plan your day" : "People make the route"}
              </p>
              <h2>{driver ? "Your availability" : "Driver team"}</h2>
            </div>
            {!driver ? (
              <Link
                prefetch={false}
                className={styles.textLink}
                href="/farm/staff"
              >
                Invite or manage access ↗
              </Link>
            ) : null}
          </div>
          <div className={styles.teamGrid}>
            {data.drivers.map((person) => (
              <article className={styles.person} key={person.id}>
                <div className={styles.personHeading}>
                  <span className={styles.avatar} aria-hidden="true">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <h3>{person.name}</h3>
                    <p>{person.phone ?? "Contact details needed"}</p>
                  </div>
                  <span
                    className={styles.availability}
                    data-ready={
                      (person.available && person.active) || undefined
                    }
                  >
                    {!person.active
                      ? "Inactive"
                      : person.available === null
                        ? "Not confirmed"
                        : person.available
                          ? "Available"
                          : "Unavailable"}
                  </span>
                </div>
                {person.active ? (
                  <>
                    <Operation
                      action="availability"
                      base={{ driver_id: person.id, date: data.date }}
                      date={data.date}
                      onUpdate={update}
                      label="Save availability"
                      build={(fd) => ({
                        available: fd.get("available") === "true",
                      })}
                    >
                      <label>
                        Availability for {formatCalendarDate(data.date)}
                        <select
                          name="available"
                          key={String(person.available)}
                          defaultValue={
                            person.available === null
                              ? ""
                              : String(person.available)
                          }
                          required
                        >
                          <option value="" disabled>
                            Confirm availability
                          </option>
                          <option value="true">Available for delivery</option>
                          <option value="false">Unavailable</option>
                        </select>
                      </label>
                    </Operation>
                    {!driver ? (
                      <details>
                        <summary>Contact and vehicle preferences</summary>
                        <Operation
                          action="profile"
                          base={{ driver_id: person.id }}
                          date={data.date}
                          onUpdate={update}
                          label="Save driver profile"
                        >
                          <label>
                            Contact number
                            <input
                              name="phone"
                              type="tel"
                              minLength={7}
                              maxLength={20}
                              defaultValue={person.phone ?? ""}
                              required
                            />
                          </label>
                          <label>
                            Preferred vehicle
                            <select
                              name="default_vehicle_id"
                              defaultValue={person.default_vehicle_id ?? ""}
                            >
                              <option value="">No preference</option>
                              {data.vehicles
                                .filter((v) => v.active)
                                .map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Operations note
                            <textarea
                              name="note"
                              maxLength={250}
                              defaultValue={person.notes ?? ""}
                            />
                          </label>
                        </Operation>
                      </details>
                    ) : null}
                  </>
                ) : null}
              </article>
            ))}
          </div>
          {!data.drivers.length ? (
            <p className={styles.empty}>
              Invite a driver from Farm staff to begin.
            </p>
          ) : null}
        </section>
      ) : null}
      {section === "vehicles" && !driver ? (
        <section>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Room for every delivery</p>
              <h2>Farm and driver vehicles</h2>
            </div>
          </div>
          <div className={styles.vehicleGrid}>
            {data.vehicles.map((v) => (
              <article className={styles.vehicle} key={v.id}>
                <span className={styles.vehicleIcon} aria-hidden="true">
                  <svg
                    width="44"
                    height="30"
                    viewBox="0 0 44 30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d="M3 21V5h23v16H3Zm23-11h8l7 8v3H26M7 11h10M7 15h7" />
                    <circle cx="10" cy="23" r="4" />
                    <circle cx="33" cy="23" r="4" />
                  </svg>
                </span>
                <p className={styles.eyebrow}>
                  {v.ownership === "farm" ? "Farm owned" : "Driver owned"} ·{" "}
                  {v.active ? "Active" : "Inactive"}
                </p>
                <h3>{v.name}</h3>
                <p>{v.registration}</p>
                <Totals
                  quantities={{
                    milk: v.milk_capacity,
                    paneer: v.paneer_capacity,
                    ghee: v.ghee_capacity,
                  }}
                  label="Vehicle capacity"
                />
                <p className={styles.helper}>
                  Up to {v.stop_capacity} stops per run
                </p>
                <details>
                  <summary>Edit vehicle</summary>
                  <VehicleForm date={data.date} onUpdate={update} vehicle={v} />
                </details>
              </article>
            ))}
          </div>
          <section className={styles.setup}>
            <div>
              <p className={styles.eyebrow}>The next member of the fleet</p>
              <h2>Add a vehicle</h2>
              <p>
                Record approved carrying limits. Paneer and ghee capacities are
                counts of 500 g packs.
              </p>
            </div>
            <VehicleForm date={data.date} onUpdate={update} />
          </section>
        </section>
      ) : null}
    </main>
  );
}
function VehicleForm({
  date,
  onUpdate,
  vehicle,
}: {
  date: string;
  onUpdate: Update;
  vehicle?: RunWorkspace["vehicles"][number];
}) {
  return (
    <Operation
      action="vehicle"
      base={vehicle ? { id: vehicle.id } : {}}
      date={date}
      onUpdate={onUpdate}
      label={vehicle ? "Save vehicle" : "Add vehicle"}
      build={(fd) => ({
        ...Object.fromEntries(fd.entries()),
        active: fd.get("active") !== "false",
      })}
    >
      <div className={styles.fields}>
        <label>
          Vehicle name
          <input
            name="name"
            defaultValue={vehicle?.name}
            minLength={2}
            maxLength={80}
            required
            placeholder="Morning delivery van"
          />
        </label>
        <label>
          Registration
          <input
            name="registration"
            defaultValue={vehicle?.registration}
            minLength={2}
            maxLength={30}
            required
          />
        </label>
        <label>
          Ownership
          <select name="ownership" defaultValue={vehicle?.ownership ?? "farm"}>
            <option value="farm">Farm owned</option>
            <option value="driver">Driver owned</option>
          </select>
        </label>
        <label>
          Milk capacity · litres
          <input
            type="number"
            name="milk_capacity"
            min="0"
            max="10000"
            step="0.01"
            defaultValue={vehicle?.milk_capacity}
            required
          />
        </label>
        <label>
          Paneer capacity · 500 g packs
          <input
            type="number"
            name="paneer_capacity"
            min="0"
            max="10000"
            defaultValue={vehicle?.paneer_capacity}
            required
          />
        </label>
        <label>
          Ghee capacity · 500 g packs
          <input
            type="number"
            name="ghee_capacity"
            min="0"
            max="10000"
            defaultValue={vehicle?.ghee_capacity}
            required
          />
        </label>
        <label>
          Stop limit
          <input
            type="number"
            name="stop_capacity"
            min="1"
            max="200"
            defaultValue={vehicle?.stop_capacity ?? 25}
            required
          />
        </label>
        {vehicle ? (
          <label>
            Availability
            <select name="active" defaultValue={String(vehicle.active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        ) : null}
      </div>
    </Operation>
  );
}
