import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { gpsFixture } from "../helpers/gps-fixture.mjs";
import { callAs } from "./runtime.mjs";
const f = await gpsFixture();
let session;
try {
  await test("GPS workspace and commands enforce active role, assignment and no direct table access", async () => {
    await assert.rejects(f.workspace(f.customer), /staff|access/i);
    assert.deepEqual((await f.workspace(f.other)).runs, []);
    await assert.rejects(
      f.command(f.other, "configure", {}),
      /assigned|Manager/i,
    );
    await assert.rejects(
      callAs(f.db, f.driver, "select * from private.gps_run_position"),
      /permission denied/,
    );
    await assert.rejects(
      callAs(f.db, f.manager, "select store_gps_route_proposal($1,$2,$3,$4)", [
        f.driver,
        f.run,
        randomUUID(),
        "{}",
      ]),
      /permission denied/,
    );
  });
  await test("manager config is versioned, validates coordinates and does not expose draft work to drivers", async () => {
    await f.configure("farm_pickup");
    await assert.rejects(
      f.command(f.manager, "configure", { version: 0 }),
      /changed/,
    );
    assert.deepEqual((await f.workspace(f.driver)).runs, []);
    await f.release();
    await assert.rejects(f.command(f.driver, "prepare"), /Start|pickup/i);
    await f.command(f.driver, "pickup");
    await f.change(f.driver, "start", { odometer: 100 });
    await assert.rejects(f.configure(), /departure/);
  });
  await test("latest location rejects stale/imprecise fixes and cannot be forged by a manager or another driver", async () => {
    await assert.rejects(f.command(f.manager, "position", {}), /Only/);
    session = (await f.command(f.driver, "start_tracking")).session_id;
    await assert.rejects(
      f.command(f.driver, "position", {
        session_id: session,
        latitude: 22.8,
        longitude: 86.2,
        accuracy: 500,
        captured_at: new Date().toISOString(),
      }),
      /fresh position/,
    );
    await assert.rejects(
      f.command(f.driver, "position", {
        session_id: session,
        latitude: 22.8,
        longitude: 86.2,
        accuracy: 10,
        captured_at: "2000-01-01",
      }),
      /fresh position/,
    );
    await f.command(f.driver, "position", {
      session_id: session,
      latitude: 22.8,
      longitude: 86.2,
      accuracy: 10,
      captured_at: new Date().toISOString(),
    });
    const run = (await f.workspace()).runs[0];
    assert.equal(Number(run.position.latitude), 22.8);
    assert.equal(run.stops.length, 3);
    await assert.rejects(f.command(f.other, "position", {}), /assigned/);
  });
  await test("provider proposal preserves every pending visit; approval and driver acceptance are separate", async () => {
    const key = randomUUID();
    const ctx = await f.command(f.driver, "prepare", {}, key);
    const payload = {
      signature: ctx.signature,
      origin: { latitude: 22.8, longitude: 86.2 },
      travel_mode: "TWO_WHEELER",
      ordered_keys: [...ctx.pending_keys].reverse(),
      duration_seconds: 600,
      distance_metres: 3000,
      baseline_seconds: 900,
      baseline_metres: 4000,
    };
    const store = async (p) =>
      (
        await f.db.query("select store_gps_route_proposal($1,$2,$3,$4) id", [
          f.driver,
          f.run,
          key,
          p,
        ])
      ).rows[0].id;
    await assert.rejects(
      store({
        ...payload,
        ordered_keys: [
          ctx.pending_keys[0],
          ctx.pending_keys[0],
          ctx.pending_keys[1],
        ],
      }),
      /every pending visit/,
    );
    const id = await store(payload);
    assert.equal(id, key);
    await assert.rejects(
      f.command(f.driver, "approve", { proposal_id: id }),
      /Manager/,
    );
    await assert.rejects(
      f.command(f.driver, "accept", { proposal_id: id }),
      /manager-approved/,
    );
    await f.command(f.manager, "approve", { proposal_id: id });
    await f.command(f.driver, "accept", { proposal_id: id });
    await assert.rejects(
      f.command(f.driver, "navigate", { visit_key: ctx.pending_keys[0] }),
      /next pending/,
    );
    await f.command(f.driver, "navigate", {
      visit_key: payload.ordered_keys[0],
    });
    await assert.rejects(f.command(f.driver, "prepare"), /active navigation/);
    await f.command(f.driver, "stop_navigation", { reason: "Blocked road" });
    assert.equal((await f.workspace()).runs[0].config.active_visit, null);
    assert.equal(
      (
        await f.db.query(
          "select route_stop_order from daily_deliveries order by route_stop_order",
        )
      ).rows
        .map((r) => r.route_stop_order)
        .join(","),
      "1,2,3",
    );
  });
  await test("recorded outcomes advance the accepted sequence without rewriting dispatch or requiring another approval", async () => {
    const run = (await f.workspace()).runs[0],
      first = run.accepted.ordered_keys[0];
    const stop = run.stops.find((s) => s.visit_key === first);
    await f.command(f.driver, "navigate", { visit_key: first });
    await callAs(
      f.db,
      f.driver,
      "select record_delivery_outcome($1,'delivered',null,null,0,null,$2)",
      [[stop.id], randomUUID()],
    );
    const after = (await f.workspace()).runs[0];
    assert.equal(after.pending_keys.length, 2);
    assert.equal(after.config.active_visit, null);
    await f.command(f.driver, "navigate", {
      visit_key: after.accepted.ordered_keys.find((k) =>
        after.pending_keys.includes(k),
      ),
    });
    await assert.rejects(
      f.command(f.manager, "approve", { proposal_id: run.accepted.id }),
      /stale/,
    );
    assert.equal(
      (
        await f.db.query(
          "select count(*) n from private.gps_run_events where result ? 'position' or payload ? 'latitude'",
        )
      ).rows[0].n,
      "0",
    );
  });
  await test("stopping location sharing removes coordinates and terminal runs cannot upload", async () => {
    await f.command(f.driver, "stop_tracking", { session_id: session });
    await assert.rejects(
      f.command(f.driver, "position", {
        session_id: session,
        latitude: 22.8,
        longitude: 86.2,
        accuracy: 10,
        captured_at: new Date().toISOString(),
      }),
      /session ended/,
    );
    assert.equal((await f.workspace()).runs[0].position, null);
    await f.change(f.driver, "finish", {
      odometer: 110,
      note: "Unrecorded visits returned for review",
    });
    await assert.rejects(
      f.command(f.driver, "position", {}),
      /assigned|active/,
    );
  });
} finally {
  await f.stop();
}

await test("automatic policy adopts a provider sequence at the driver’s position with no per-run manager click", async () => {
  const x = await gpsFixture();
  try {
    await x.configure("already_loaded", "road");
    await x.release();
    await x.change(x.driver, "start", { odometer: 1 });
    const session = (await x.command(x.driver, "start_tracking")).session_id;
    await x.command(x.driver, "position", {
      session_id: session,
      latitude: 22.8,
      longitude: 86.2,
      accuracy: 10,
      captured_at: new Date().toISOString(),
    });
    const request = randomUUID(),
      ctx = await x.command(x.driver, "prepare", {}, request);
    const payload = {
      signature: ctx.signature,
      ordered_keys: [...ctx.pending_keys].reverse(),
      origin: { latitude: 22.8, longitude: 86.2 },
      travel_mode: "TWO_WHEELER",
      duration_seconds: 600,
      distance_metres: 3000,
      baseline_seconds: 900,
      baseline_metres: 4000,
    };
    await x.db.query("select store_gps_route_proposal($1,$2,$3,$4)", [
      x.driver,
      x.run,
      request,
      payload,
    ]);
    const run = (await x.workspace(x.driver)).runs[0];
    assert.ok(run.accepted.accepted_at);
    assert.equal(run.accepted.approved_by, x.manager);
    await x.command(x.driver, "navigate", {
      visit_key: payload.ordered_keys[0],
    });
    const events = (
      await x.db.query(
        "select count(*) n from private.gps_run_events where action='automatic_plan'",
      )
    ).rows[0].n;
    assert.equal(events, "1");
    // A stopped old session cannot race a new session and erase or replace its position.
    await x.command(x.driver, "stop_tracking", { session_id: session });
    const newer = (await x.command(x.driver, "start_tracking")).session_id;
    await x.command(x.driver, "position", {
      session_id: newer,
      latitude: 22.81,
      longitude: 86.21,
      accuracy: 10,
      captured_at: new Date().toISOString(),
    });
    await x.command(x.driver, "stop_tracking", { session_id: session });
    assert.ok((await x.workspace()).runs[0].position);
    await assert.rejects(
      x.command(x.driver, "position", {
        session_id: session,
        latitude: 22.8,
        longitude: 86.2,
        accuracy: 10,
        captured_at: new Date().toISOString(),
      }),
      /session ended/,
    );
  } finally {
    await x.stop();
  }
});

await test("future runs inherit an explicitly reusable policy without inheriting pickup, navigation or driver location", async () => {
  const x = await gpsFixture();
  try {
    await x.command(x.manager, "configure", {
      version: 0,
      start_mode: "farm_pickup",
      travel_mode: "TWO_WHEELER",
      sequencing: "road",
      hub_latitude: 22.79,
      hub_longitude: 86.19,
      hub_label: "Fixture farm",
      reuse_policy: true,
    });
    const source = (
      await x.db.query("select * from delivery_runs where id=$1", [x.run])
    ).rows[0];
    const next = (
      await x.db.query(
        "insert into delivery_runs(delivery_date,route_id,driver_id,vehicle_id,manifest,created_by) values($1::date+1,$2,$3,$4,'[]',$5) returning id",
        [
          x.date,
          source.route_id,
          source.driver_id,
          source.vehicle_id,
          x.manager,
        ],
      )
    ).rows[0].id;
    const config = (
      await x.db.query("select * from private.gps_run_config where run_id=$1", [
        next,
      ])
    ).rows[0];
    assert.equal(config.sequencing, "road");
    assert.equal(config.version, 1);
    assert.equal(config.pickup_confirmed_at, null);
    assert.equal(config.active_visit, null);
    assert.equal(
      (
        await x.db.query(
          "select count(*) n from private.gps_run_position where run_id=$1",
          [next],
        )
      ).rows[0].n,
      "0",
    );
    // The latest policy can turn reuse off; an older enabled policy must not revive it.
    await callAs(
      x.db,
      x.manager,
      "select gps_run_command($1,'configure',$2,$3)",
      [
        next,
        JSON.stringify({
          version: 1,
          start_mode: "already_loaded",
          travel_mode: "DRIVE",
          sequencing: "manual",
          hub_latitude: 22.79,
          hub_longitude: 86.19,
          hub_label: "Fixture farm",
          reuse_policy: false,
        }),
        randomUUID(),
      ],
    );
    const disabled = (
      await x.db.query(
        "insert into delivery_runs(delivery_date,route_id,driver_id,vehicle_id,manifest,created_by) values($1::date+2,$2,$3,$4,'[]',$5) returning id",
        [
          x.date,
          source.route_id,
          source.driver_id,
          source.vehicle_id,
          x.manager,
        ],
      )
    ).rows[0].id;
    assert.equal(
      (
        await x.db.query(
          "select count(*) n from private.gps_run_config where run_id=$1",
          [disabled],
        )
      ).rows[0].n,
      "0",
    );
    // Restore the latest policy, then check that a deactivated manager cannot authorize inheritance.
    await callAs(
      x.db,
      x.manager,
      "select gps_run_command($1,'configure',$2,$3)",
      [
        next,
        JSON.stringify({
          version: 2,
          start_mode: "already_loaded",
          travel_mode: "DRIVE",
          sequencing: "manual",
          hub_latitude: 22.79,
          hub_longitude: 86.19,
          hub_label: "Fixture farm",
          reuse_policy: true,
        }),
        randomUUID(),
      ],
    );
    await x.db.query("update farm_staff set active=false where user_id=$1", [
      x.manager,
    ]);
    const later = (
      await x.db.query(
        "insert into delivery_runs(delivery_date,route_id,driver_id,vehicle_id,manifest,created_by) values($1::date+3,$2,$3,$4,'[]',$5) returning id",
        [
          x.date,
          source.route_id,
          source.driver_id,
          source.vehicle_id,
          x.manager,
        ],
      )
    ).rows[0].id;
    assert.equal(
      (
        await x.db.query(
          "select count(*) n from private.gps_run_config where run_id=$1",
          [later],
        )
      ).rows[0].n,
      "0",
    );
  } finally {
    await x.stop();
  }
});
