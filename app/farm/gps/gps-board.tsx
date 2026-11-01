"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { hasConfirmedDestination } from "@/lib/delivery-navigation";
import { productName } from "@/lib/delivery-calendar";
import {
  gpsNavigationUrl,
  gpsTime,
  locationState,
  mapsPointUrl,
  orderedPendingStops,
  validateFix,
  type GpsRun,
  type GpsWorkspace,
} from "@/lib/gps-routing";
import { gpsAction, refreshGps } from "./actions";
import { saveRunOperation } from "../runs/actions";
import styles from "./gps.module.css";

function Gauge({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className={styles.gauge}>
      <svg
        viewBox="0 0 280 165"
        role="img"
        aria-label={`${done} of ${total} visits recorded`}
      >
        <path
          className={styles.track}
          pathLength="100"
          d="M20 140 A120 120 0 0 1 260 140"
        />
        <path
          className={styles.fill}
          pathLength="100"
          d="M20 140 A120 120 0 0 1 260 140"
          strokeDasharray={`${percent} 100`}
        />
      </svg>
      <div>
        <strong>
          {done}
          <small> / {total}</small>
        </strong>
        <span>visits recorded</span>
      </div>
    </div>
  );
}
const minutes = (seconds: number) => `${Math.ceil(seconds / 60)} min`;
const active = (r: GpsRun) => ["released", "in_progress"].includes(r.status);

export function GpsBoard({
  initial,
  providerReady,
  mapKey,
  initialNow,
}: {
  initial: GpsWorkspace;
  providerReady: boolean;
  mapKey: string | null;
  initialNow: number;
}) {
  const [workspace, setWorkspace] = useState(initial);
  const [selected, setSelected] = useState(initial.runs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(initialNow);
  const watch = useRef<number | null>(null);
  const positionTimer = useRef<number | null>(null);
  const sharingSession = useRef<string | null>(null);
  const generation = useRef(0);
  const inflight = useRef(false);
  const sentAt = useRef(0);
  const autoAttempt = useRef<string | null>(null);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const run =
    workspace.runs.find((r) => r.id === selected) ?? workspace.runs[0];
  const driver = workspace.role === "driver";
  const total = workspace.runs.reduce(
    (n, r) => n + r.stops.filter((s) => !s.cancelled).length,
    0,
  );
  const done = workspace.runs.reduce(
    (n, r) => n + r.stops.filter((s) => s.recorded && !s.cancelled).length,
    0,
  );
  const pending = run ? orderedPendingStops(run) : [];
  const next = pending[0];
  const recorded =
    run?.stops.filter((s) => s.recorded && !s.cancelled).length ?? 0;
  const totalRun = run?.stops.filter((s) => !s.cancelled).length ?? 0;
  const message = (text: string, failed = false) => {
    setFeedback(text);
    setError(failed);
  };

  // Only the dedicated GPS page refreshes its read model. Dirty configuration inputs are uncontrolled and stay put.
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      const result = await refreshGps(initial.date).catch(() => null);
      if (mounted && result?.workspace) setWorkspace(result.workspace);
    };
    const timer = window.setInterval(tick, 20000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [initial.date]);
  useEffect(() => {
    const stop = () => {
      generation.current++;
      if (watch.current !== null)
        navigator.geolocation?.clearWatch(watch.current);
      watch.current = null;
      if (positionTimer.current !== null)
        window.clearInterval(positionTimer.current);
      positionTimer.current = null;
    };
    const hidden = () => {
      if (document.visibilityState === "hidden" && watch.current !== null) {
        stop();
        setSharing(false);
        // Best effort only. If the browser suspends this call, the manager sees the timestamp go stale.
        void gpsAction(
          selected,
          initial.date,
          "stop_tracking",
          { session_id: sharingSession.current },
          crypto.randomUUID(),
        ).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [selected, initial.date]);
  useEffect(() => {
    if (!run || active(run)) return;
    generation.current++;
    if (watch.current !== null)
      navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    if (positionTimer.current !== null)
      window.clearInterval(positionTimer.current);
    positionTimer.current = null;
  }, [run]);

  async function command(
    action: string,
    payload: Record<string, unknown> = {},
  ) {
    if (!run || busy) return false;
    const signature = JSON.stringify({ id: run.id, action, payload });
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await gpsAction(
        run.id,
        workspace.date,
        action,
        payload,
        request.current.key,
      );
      if (result.workspace) setWorkspace(result.workspace);
      message(result.message, !result.ok);
      if (result.ok) request.current = null;
      return result.ok;
    } catch {
      message(
        "We couldn’t confirm the save. Refresh to check the run before retrying.",
        true,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await refreshGps(workspace.date);
      if (result.workspace) setWorkspace(result.workspace);
      message(result.ok ? "Workspace updated." : result.message, !result.ok);
    } catch {
      message("Reconnect to update the workspace.", true);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!run || !driver || !active(run)) return;
    if (watch.current !== null) {
      generation.current++;
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      setSharing(false);
      if (positionTimer.current !== null)
        window.clearInterval(positionTimer.current);
      positionTimer.current = null;
      await command("stop_tracking", { session_id: sharingSession.current });
      sharingSession.current = null;
      return;
    }
    if (!navigator.geolocation) {
      message(
        "Location is unavailable on this device. Your manual route is still available.",
        true,
      );
      return;
    }
    const epoch = ++generation.current;
    setBusy(true);
    try {
      const result = await gpsAction(
        run.id,
        workspace.date,
        "start_tracking",
        {},
        crypto.randomUUID(),
      );
      if (!result.ok || !result.sessionId) {
        message(result.message, true);
        return;
      }
      if (epoch !== generation.current) return;
      sharingSession.current = result.sessionId;
    } catch {
      message("Reconnect before sharing your location.", true);
      return;
    } finally {
      setBusy(false);
    }
    sentAt.current = 0;
    setSharing(true);
    message("Finding an accurate position…");
    const receive = async (position: GeolocationPosition) => {
      if (
        epoch !== generation.current ||
        inflight.current ||
        Date.now() - sentAt.current < 15000
      )
        return;
      try {
        const fix = validateFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captured_at: new Date(position.timestamp).toISOString(),
        });
        inflight.current = true;
        const result = await gpsAction(
          run.id,
          workspace.date,
          "position",
          { ...fix, session_id: sharingSession.current },
          crypto.randomUUID(),
        );
        if (epoch !== generation.current) return;
        if (result.workspace) setWorkspace(result.workspace);
        if (result.ok) sentAt.current = Date.now();
        message(result.message, !result.ok);
        const updated = result.workspace?.runs.find((r) => r.id === run.id);
        const alreadyAccepted =
          updated?.accepted &&
          updated.accepted.run_version === updated.version &&
          updated.accepted.config_version === updated.config?.version;
        if (
          result.ok &&
          providerReady &&
          updated?.status === "in_progress" &&
          updated.config &&
          updated.config.sequencing !== "review" &&
          !alreadyAccepted &&
          !updated.config.active_visit &&
          autoAttempt.current !== updated.signature
        ) {
          autoAttempt.current = updated.signature;
          message("Planning your route automatically…");
          const planned = await gpsAction(
            run.id,
            workspace.date,
            "propose",
            {},
            crypto.randomUUID(),
          );
          if (epoch !== generation.current) return;
          if (planned.workspace) setWorkspace(planned.workspace);
          message(
            planned.ok
              ? "Your route is ready. Continue to the next doorstep."
              : planned.message,
            !planned.ok,
          );
        }
      } catch (e) {
        if (epoch === generation.current)
          message(
            e instanceof Error
              ? e.message
              : "Position could not be shared. Reconnect and try again.",
            true,
          );
      } finally {
        inflight.current = false;
      }
    };
    const denied = (e: GeolocationPositionError) => {
      if (epoch !== generation.current) return;
      generation.current++;
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      setSharing(false);
      if (positionTimer.current !== null)
        window.clearInterval(positionTimer.current);
      positionTimer.current = null;
      message(
        e.code === 1
          ? "Location permission was denied. Enable it in browser settings or use the manual route."
          : "A fresh location could not be found. Try again outdoors.",
        true,
      );
    };
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    watch.current = navigator.geolocation.watchPosition(
      receive,
      denied,
      options,
    );
    positionTimer.current = window.setInterval(() => {
      if (
        epoch === generation.current &&
        document.visibilityState === "visible"
      )
        navigator.geolocation.getCurrentPosition(receive, denied, options);
    }, 30000);
  }
  async function start(fd: FormData) {
    if (!run || busy) return;
    setBusy(true);
    try {
      const result = await saveRunOperation(
        "start",
        {
          id: run.id,
          version: run.version,
          odometer: Number(fd.get("odometer")),
        },
        crypto.randomUUID(),
        workspace.date,
      );
      if (!result.ok) {
        message(result.message, true);
        return;
      }
      const latest = await refreshGps(workspace.date);
      if (latest.workspace) setWorkspace(latest.workspace);
      message("Run started. Finding your position…");
      await share();
    } catch {
      message("We couldn’t confirm the start. Refresh before retrying.", true);
    } finally {
      setBusy(false);
    }
  }
  const config = run?.config;
  const proposal = run?.proposal;
  const validProposal =
    proposal &&
    proposal.signature === run.signature &&
    Date.parse(proposal.expires_at) > now;
  const accepted =
    run?.accepted &&
    run.accepted.run_version === run.version &&
    run.accepted.config_version === config?.version;
  const missingPins = pending.filter((s) => !hasConfirmedDestination(s)).length;
  const positionLabel = locationState(run?.position ?? null, now);
  return (
    <main className={styles.page} data-gps-workspace>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>The daily workspace</p>
          <h1>
            {driver
              ? "Your route, thoughtfully planned."
              : "A clear view of the road ahead."}
          </h1>
        </div>
        <form className={styles.date}>
          <label>
            Service date
            <input type="date" name="date" defaultValue={workspace.date} />
          </label>
          <button className={styles.secondary}>Open day</button>
        </form>
      </header>
      <section className={`${styles.hero} ${driver ? styles.driverHero : ""}`}>
        <div>
          <p className={styles.eyebrow}>
            {driver ? "Your assigned work" : "Today, together"}
          </p>
          <h2>
            {driver
              ? (run?.route_name ?? "My delivery run")
              : "A good morning,\nbeautifully in motion."}
          </h2>
          <p>
            {workspace.runs.length
              ? `${workspace.runs.length} assigned ${workspace.runs.length === 1 ? "run" : "runs"}. Every outcome stays with its delivery record.`
              : "Prepare and release a delivery run to bring its assigned stops into view."}
          </p>
          <Link
            className={styles.primary}
            href={`/farm/runs?date=${workspace.date}`}
          >
            {driver ? "My delivery run" : "Manage delivery runs"} ↗
          </Link>
        </div>
        <Gauge
          done={driver && run ? recorded : done}
          total={driver && run ? totalRun : total}
        />
      </section>
      <div className={styles.toolbar}>
        <span>GPS routing · {driver ? "your runs" : "manager workspace"}</span>
        <button className={styles.secondary} onClick={refresh} disabled={busy}>
          Update now
        </button>
      </div>
      <p className={styles.feedback} role={error ? "alert" : "status"}>
        {busy ? "Updating the run…" : feedback}
      </p>
      {!workspace.runs.length ? (
        <section className={styles.panel}>
          <h2>
            {driver ? "No released run assigned" : "No runs for this day"}
          </h2>
          <p>
            {driver
              ? "Your manager must assign and release your run first."
              : "Prepare the day, assign drivers and confirm physical loads in Delivery runs."}
          </p>
        </section>
      ) : (
        <div
          className={`${styles.columns} ${driver ? styles.driverColumns : ""}`}
        >
          {!driver || workspace.runs.length > 1 ? (
            <aside className={styles.runList} aria-label="Assigned runs">
              <h2>{driver ? "My runs" : "Your routes"}</h2>
              {workspace.runs.map((r) => {
                const count = r.stops.filter((s) => !s.cancelled).length,
                  complete = r.stops.filter(
                    (s) => s.recorded && !s.cancelled,
                  ).length;
                return (
                  <button
                    className={styles.route}
                    key={r.id}
                    aria-pressed={r.id === run?.id}
                    onClick={() => {
                      setSelected(r.id);
                      setSharing(false);
                      message("");
                    }}
                  >
                    <span>
                      <strong>{r.route_name}</strong>
                      <small>
                        {r.driver_name} · {r.status.replaceAll("_", " ")}
                      </small>
                    </span>
                    <b>
                      {complete} / {count}
                    </b>
                    <span className={styles.bar}>
                      <i
                        style={{
                          width: `${count ? (complete / count) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </aside>
          ) : null}
          {run ? (
            <div className={styles.detail} key={run.id}>
              <section className={styles.panel}>
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>
                      {driver ? "My run" : run.driver_name}
                    </p>
                    <h2>{run.route_name}</h2>
                  </div>
                  <span className={styles.pill}>{pending.length} pending</span>
                </div>
                <div className={styles.statusRow}>
                  <span>{positionLabel}</span>
                  {run.position ? (
                    <small>
                      Captured {gpsTime(run.position.captured_at, true)} IST · ±
                      {Math.round(run.position.accuracy)} m
                    </small>
                  ) : null}
                </div>
                {run.position ? (
                  <>
                    <a
                      className={styles.textLink}
                      href={mapsPointUrl(run.position)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open last reported location in Maps ↗
                    </a>
                    {mapKey ? (
                      <iframe
                        className={styles.map}
                        title="Last reported driver position"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapKey)}&q=${encodeURIComponent(`${run.position.latitude},${run.position.longitude}`)}`}
                      />
                    ) : null}
                  </>
                ) : null}
                {driver && active(run) ? (
                  <>
                    <button
                      className={styles.secondary}
                      onClick={share}
                      disabled={busy}
                    >
                      {sharing
                        ? "Stop sharing location"
                        : "Share my current position"}
                    </button>
                    <p className={styles.helper}>
                      Location sharing works while this screen is visible.
                      Opening Maps or locking the phone pauses web updates.
                      Android background tracking is a separate app release.
                    </p>
                  </>
                ) : null}
              </section>
              {!driver ? (
                <section className={styles.panel}>
                  <details open={!config}>
                    <summary className={styles.settingsSummary}>
                      GPS run settings
                    </summary>
                    <p className={styles.helper}>
                      The farm or return point is the final destination. Use
                      manual sequencing for time-sensitive or fixed-order
                      routes.
                    </p>
                    <form
                      key={config?.version ?? 0}
                      className={styles.form}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        await command("configure", {
                          version: config?.version ?? 0,
                          start_mode: fd.get("start_mode"),
                          travel_mode: fd.get("travel_mode"),
                          sequencing: fd.get("sequencing"),
                          hub_label: fd.get("hub_label"),
                          reuse_policy: fd.get("reuse_policy") === "on",
                          hub_latitude: Number(fd.get("hub_latitude")),
                          hub_longitude: Number(fd.get("hub_longitude")),
                        });
                      }}
                    >
                      <fieldset
                        disabled={
                          busy ||
                          ![
                            "loading",
                            "awaiting_ack",
                            "acknowledged",
                            "released",
                          ].includes(run.status)
                        }
                      >
                        <div className={styles.fields}>
                          <label>
                            Start mode
                            <select
                              name="start_mode"
                              defaultValue={config?.start_mode ?? "farm_pickup"}
                            >
                              <option value="farm_pickup">
                                Collect at farm first
                              </option>
                              <option value="already_loaded">
                                Already loaded · current position
                              </option>
                            </select>
                          </label>
                          <label>
                            Vehicle routing
                            <select
                              name="travel_mode"
                              defaultValue={
                                config?.travel_mode ?? "TWO_WHEELER"
                              }
                            >
                              <option value="TWO_WHEELER">
                                Motorcycle / scooter
                              </option>
                              <option value="DRIVE">Car / van</option>
                            </select>
                          </label>
                          <label>
                            Stop sequence
                            <select
                              name="sequencing"
                              defaultValue={config?.sequencing ?? "road"}
                            >
                              <option value="road">
                                Automatic road-based sequencing
                              </option>
                              <option value="manual">
                                Automatic · keep manager’s order
                              </option>
                              <option value="review">
                                Require manager review of each proposal
                              </option>
                            </select>
                          </label>
                          <label>
                            Farm / return point name
                            <input
                              name="hub_label"
                              minLength={2}
                              maxLength={80}
                              defaultValue={config?.hub_label ?? ""}
                              required
                            />
                          </label>
                          <label>
                            Return-point latitude
                            <input
                              type="number"
                              name="hub_latitude"
                              min={-90}
                              max={90}
                              step="any"
                              defaultValue={config?.hub_latitude ?? ""}
                              required
                            />
                          </label>
                          <label>
                            Return-point longitude
                            <input
                              type="number"
                              name="hub_longitude"
                              min={-180}
                              max={180}
                              step="any"
                              defaultValue={config?.hub_longitude ?? ""}
                              required
                            />
                          </label>
                        </div>
                        <label className={styles.check}>
                          <input
                            name="reuse_policy"
                            type="checkbox"
                            defaultChecked={config?.reuse_policy ?? true}
                          />
                          <span>
                            Reuse for future runs on this route and vehicle.
                            Each load still needs its own check.
                          </span>
                        </label>
                        <button className={styles.primary} disabled={busy}>
                          Save GPS settings ↗
                        </button>
                      </fieldset>
                    </form>
                  </details>
                </section>
              ) : null}
              {driver && config && run.status === "released" ? (
                <section className={styles.panel}>
                  <h2>
                    {config.start_mode === "farm_pickup"
                      ? "Collect your checked load"
                      : "Your load is ready"}
                  </h2>
                  {config.start_mode === "farm_pickup" &&
                  !config.pickup_confirmed_at ? (
                    <>
                      <a
                        className={styles.textLink}
                        target="_blank"
                        rel="noreferrer"
                        href={
                          gpsNavigationUrl(
                            {
                              address_snapshot: config.hub_label,
                              destination_latitude: config.hub_latitude,
                              destination_longitude: config.hub_longitude,
                              destination_confirmed_at: "configured",
                            },
                            config.travel_mode,
                          )!
                        }
                      >
                        Navigate to {config.hub_label} ↗
                      </a>
                      <p className={styles.helper}>
                        Confirm only after physically collecting the load you
                        accepted.
                      </p>
                      <button
                        className={styles.primary}
                        disabled={busy}
                        onClick={() => command("pickup")}
                      >
                        I collected my checked load
                      </button>
                    </>
                  ) : (
                    <form action={start} className={styles.form}>
                      <label>
                        Opening odometer · km
                        <input
                          name="odometer"
                          type="number"
                          min="0"
                          step="0.1"
                          required
                        />
                      </label>
                      <button className={styles.primary} disabled={busy}>
                        Start my run ↗
                      </button>
                    </form>
                  )}
                </section>
              ) : null}
              <section
                className={`${styles.panel} ${driver && accepted ? styles.planningLater : ""}`}
              >
                <div className={styles.sectionHeading}>
                  <h2>Plan from the starting point</h2>
                  <span className={styles.pill}>
                    {config?.start_mode === "already_loaded"
                      ? "Current position"
                      : "Farm pickup"}
                  </span>
                </div>
                {!config ? (
                  <p>
                    Ask the manager to save the GPS settings before planning.
                  </p>
                ) : (
                  <>
                    <p className={styles.helper}>
                      {driver
                        ? "Share a fresh position after starting. The manager’s saved policy controls whether your road plan is adopted automatically or needs review."
                        : "Manager previews start at the configured farm. The driver’s final proposal starts at their shared position."}
                    </p>
                    {missingPins ? (
                      <p className={styles.notice}>
                        {missingPins} pending{" "}
                        {missingPins === 1
                          ? "entrance needs"
                          : "entrances need"}{" "}
                        confirmation. Keep the manual route until every
                        destination is checked.
                      </p>
                    ) : null}
                    {!providerReady ? (
                      <p className={styles.notice}>
                        Road routing is awaiting provider activation. The
                        existing manual route is available.
                      </p>
                    ) : null}
                    <button
                      className={styles.primary}
                      onClick={() => command("propose")}
                      disabled={
                        busy ||
                        !providerReady ||
                        !!missingPins ||
                        !pending.length ||
                        !active(run) ||
                        !!config.active_visit
                      }
                    >
                      {config.sequencing === "review"
                        ? "Calculate road proposal ↗"
                        : "Recalculate automatic route ↗"}
                    </button>
                    <p className={styles.helper}>
                      Up to 25 pending visits; estimates include returning to{" "}
                      {config.hub_label}. Road estimates exclude traffic and
                      doorstep service time.
                    </p>
                    {config.travel_mode === "TWO_WHEELER" ? (
                      <p className={styles.helper}>
                        Two-wheeler routes are in beta and may miss suitable
                        roads. Check local access and follow road signs.
                      </p>
                    ) : null}
                  </>
                )}
                {proposal ? (
                  <div className={styles.proposal}>
                    <p className={styles.eyebrow}>
                      {proposal.accepted_at
                        ? "Active road plan"
                        : validProposal
                          ? "Road proposal"
                          : "Older proposal · refresh required"}
                    </p>
                    <div className={styles.metrics}>
                      <div>
                        <strong>{minutes(proposal.duration_seconds)}</strong>
                        <span>Proposed driving time</span>
                      </div>
                      <div>
                        <strong>
                          {(proposal.distance_metres / 1000).toFixed(1)} km
                        </strong>
                        <span>Provider estimate</span>
                      </div>
                      <div>
                        <strong>{minutes(proposal.baseline_seconds)}</strong>
                        <span>Original order estimate</span>
                      </div>
                    </div>
                    <p className={styles.helper}>
                      Calculated {gpsTime(proposal.created_at)} IST ·{" "}
                      {proposal.travel_mode === "TWO_WHEELER"
                        ? "motorcycle"
                        : "car / van"}
                      . Estimates are not a delivery promise.
                    </p>
                    <ol className={styles.proposedStops}>
                      {proposal.ordered_keys.map((key) => (
                        <li key={key}>
                          {run.stops.find((s) => s.visit_key === key)
                            ?.customer_name ?? "Visit no longer pending"}
                        </li>
                      ))}
                    </ol>
                    {!driver ? (
                      <button
                        className={styles.primary}
                        disabled={
                          busy || !validProposal || !!proposal.approved_at
                        }
                        onClick={() =>
                          command("approve", { proposal_id: proposal.id })
                        }
                      >
                        {proposal.approved_at
                          ? "Manager approved"
                          : "Approve this sequence"}
                      </button>
                    ) : (
                      <button
                        className={styles.primary}
                        disabled={
                          busy ||
                          !validProposal ||
                          !proposal.approved_at ||
                          !!proposal.accepted_at
                        }
                        onClick={() =>
                          command("accept", { proposal_id: proposal.id })
                        }
                      >
                        {proposal.accepted_at
                          ? "Sequence accepted"
                          : proposal.approved_at
                            ? "Accept this road plan"
                            : "Waiting for manager approval"}
                      </button>
                    )}
                  </div>
                ) : null}
              </section>
              {driver && next ? (
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>Your next doorstep</p>
                  <h2>{next.customer_name}</h2>
                  <p>{next.address_snapshot}</p>
                  <dl className={styles.products}>
                    {next.items.map((i) => (
                      <div key={i.product_key}>
                        <dt>{productName(i.product_key)}</dt>
                        <dd>
                          {i.quantity} {i.unit}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {accepted ? (
                    <button
                      className={styles.primary}
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await command("navigate", {
                            visit_key: next.visit_key,
                          })
                        ) {
                          window.location.assign(
                            gpsNavigationUrl(next, config!.travel_mode)!,
                          );
                        }
                      }}
                    >
                      Navigate to next entrance ↗
                    </button>
                  ) : (
                    <p className={styles.helper}>
                      Your automatic route will appear after a fresh location is
                      shared. You can also continue with the existing manual
                      route.
                    </p>
                  )}
                  <Link
                    className={styles.secondary}
                    href={`/farm/delivery-sheet?${new URLSearchParams({ date: workspace.date, route: run.route_id, stop: next.id })}`}
                  >
                    Open delivery record
                  </Link>
                  {config?.active_visit ? (
                    <form
                      className={styles.form}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await command("stop_navigation", {
                          reason: new FormData(e.currentTarget).get("reason"),
                        });
                      }}
                    >
                      <label>
                        Need a different road? Explain why
                        <input
                          name="reason"
                          minLength={3}
                          maxLength={250}
                          required
                        />
                      </label>
                      <button className={styles.secondary} disabled={busy}>
                        Stop active leg for replanning
                      </button>
                    </form>
                  ) : null}
                </section>
              ) : null}
              {driver && !next && config && run.status === "in_progress" ? (
                <section className={styles.panel}>
                  <p className={styles.eyebrow}>Every visit has an outcome</p>
                  <h2>Ready for the return journey.</h2>
                  <a
                    className={styles.primary}
                    href={
                      gpsNavigationUrl(
                        {
                          address_snapshot: config.hub_label,
                          destination_latitude: config.hub_latitude,
                          destination_longitude: config.hub_longitude,
                          destination_confirmed_at: "configured",
                        },
                        config.travel_mode,
                      )!
                    }
                  >
                    Return to {config.hub_label} ↗
                  </a>
                  <Link
                    className={styles.textLink}
                    href={`/farm/runs?date=${workspace.date}`}
                  >
                    Record return and reconcile the load
                  </Link>
                </section>
              ) : null}
              <section className={styles.panel}>
                <h2>
                  {driver ? "Your remaining stops" : "Assigned doorsteps"}
                </h2>
                <ol className={styles.stops}>
                  {(driver ? pending : run.stops).map((s, i) => (
                    <li key={s.visit_key}>
                      <span className={styles.number}>
                        {s.recorded ? "✓" : i + 1}
                      </span>
                      <div>
                        <strong>{s.customer_name}</strong>
                        <small>
                          {s.cancelled
                            ? "Cancelled"
                            : s.recorded
                              ? "Outcome recorded"
                              : hasConfirmedDestination(s)
                                ? "Confirmed entrance"
                                : "Written address · pin needed"}
                        </small>
                      </div>
                      <Link
                        href={`/farm/delivery-sheet?${new URLSearchParams({ date: workspace.date, route: run.route_id, stop: s.id })}`}
                        aria-label={`Open delivery for ${s.customer_name}`}
                      >
                        ↗
                      </Link>
                    </li>
                  ))}
                </ol>
                <Link
                  className={styles.textLink}
                  href={`/farm/delivery-sheet?date=${workspace.date}&route=${run.route_id}`}
                >
                  Open existing delivery workflow ↗
                </Link>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
