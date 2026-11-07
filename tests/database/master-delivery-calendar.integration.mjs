import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";
import { callAs, createDatabase } from "./runtime.mjs";

test("master preferences are versioned, customer owned and separate from fulfilment", async () => {
  const runtime = await createDatabase();
  const { db } = runtime;
  const device = new Client(runtime.config);
  await device.connect();
  try {
    await db.query(await readFile(new URL("../../docs/verification/master-delivery-calendar.local.sql", import.meta.url), "utf8"));
    const user = randomUUID(), other = randomUUID();
    await db.query("insert into auth.users(id,email) select x,x::text||'@fixture.invalid' from unnest($1::uuid[]) x", [[user, other]]);
    const [{ start, target, paidDate }] = (await db.query(
      'select (private.operational_today()+1)::text start, (private.operational_today()+4)::text target, (private.operational_today()+6)::text "paidDate"',
    )).rows;
    const read = async (client, actor) => (await callAs(client, actor, "select read_master_delivery_schedule($1,$2) result", [start, paidDate])).rows[0].result;
    const save = (client, revision, date, quantities) => callAs(client, user, "select save_master_delivery_schedule($1,$2,$3)", [revision, date, quantities]);
    const pattern = { milk: [1, 1, 1, 1, 1, 4, 2], paneer: [0, 0, 0, 0, 0, 1, 0], ghee: [0, 0, 0, 0, 0, 0, 1] };
    const override = { milk: 5, paneer: 0, ghee: null };
    assert.deepEqual(await read(db, user), { revision: 0, versions: [], exceptions: [] });
    await assert.rejects(read(db, null), /Sign in/);
    await assert.rejects(save(db, 0, null, { ...pattern, milk: [1, 2] }), /seven/);
    await assert.rejects(save(db, 0, target, { ...override, milk: 8 }), /zero to five/);
    await save(db, 0, null, pattern);
    await save(db, 1, target, override);
    await assert.rejects(save(db, 1, target, override), /schedule changed/);
    const fromOtherDevice = await read(device, user);
    assert.equal(fromOtherDevice.revision, 2);
    assert.deepEqual(fromOtherDevice.versions[0].quantities, pattern);
    assert.deepEqual(fromOtherDevice.exceptions, [
      { delivery_date: target, product_key: "milk", quantity: 5 },
      { delivery_date: target, product_key: "paneer", quantity: 0 },
    ]);
    assert.deepEqual(await read(device, other), { revision: 0, versions: [], exceptions: [] });
    await assert.rejects(callAs(db, user, "select * from private.master_date_preferences"), /permission denied/);

    const nextPattern = { ...pattern, milk: [0, 0, 0, 0, 0, 3, 2] };
    await save(device, 2, null, nextPattern);
    assert.deepEqual((await read(db, user)).exceptions, fromOtherDevice.exceptions);
    await save(db, 3, target, { milk: null, paneer: null, ghee: null });
    assert.deepEqual((await read(db, user)).exceptions, []);
    assert.equal((await db.query("select count(*)::int n from daily_deliveries")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from orders")).rows[0].n, 0);

    await db.query(
      "insert into orders(user_id,purchase_mode,status,bottle_choice,subtotal_paise,total_paise,start_date,phone_snapshot,address_snapshot) values($1,'once','paid','none',100,100,$2,'0000000000','Fixture')",
      [user, paidDate],
    );
    await assert.rejects(save(db, 4, paidDate, override), /paid delivery controls/);
    assert.equal((await db.query("select status from orders")).rows[0].status, "paid");
    const datedRule = {
      id: "milk", repeat: "custom", quantity: 2, firstDate: start, dates: [start, target],
      dateQuantities: { [start]: 2, [target]: 5 },
    };
    const plan = (await callAs(db, user, "select save_pending_monthly_plan($1,'return',$2) id", [
      start, JSON.stringify([datedRule]),
    ])).rows[0].id;
    const { rows } = await db.query(
      "select delivery_date::text,quantity::int from scheduled_delivery_items where plan_id=$1 order by delivery_date",
      [plan],
    );
    assert.deepEqual(rows, [{ delivery_date: start, quantity: 2 }, { delivery_date: target, quantity: 5 }]);
    await assert.rejects(callAs(db, user, "select save_pending_monthly_plan($1,'return',$2)", [
      start, JSON.stringify([{ ...datedRule, dateQuantities: { [start]: 2, [target]: 9 } }]),
    ]), /Invalid dated quantities/);
    assert.equal((await db.query("select count(*)::int n from daily_deliveries")).rows[0].n, 0);

  } finally {
    await device.end();
    await runtime.stop();
  }
});
