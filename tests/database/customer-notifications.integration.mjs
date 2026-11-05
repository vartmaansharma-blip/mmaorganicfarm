import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { callAs, createDatabase } from "./runtime.mjs";

test("customers can read their own notifications and only change read status", async () => {
  const runtime = await createDatabase();
  const { db } = runtime;
  try {
    await db.query(await readFile(new URL("../../supabase/migrations/20261105121856_customer_notification_permissions.sql", import.meta.url), "utf8"));
    const [customer, other, first, second] = Array.from({ length: 4 }, randomUUID);
    await db.query("insert into auth.users(id) values ($1), ($2)", [customer, other]);
    await db.query("insert into customer_notifications(id,user_id,kind,title,message) values ($1,$2,'delivery_ready','A','A'),($3,$4,'payment_confirmed','B','B')", [first, customer, second, other]);
    await db.query("begin");
    try {
      await db.query("set local role anon");
      await assert.rejects(db.query("select id from customer_notifications"), { code: "42501" });
    } finally {
      await db.query("rollback");
    }
    assert.deepEqual((await callAs(db, customer, "select id from customer_notifications")).rows, [{ id: first }]);
    assert.equal((await callAs(db, customer, "update customer_notifications set read_at=now() where id=$1 returning id", [second])).rowCount, 0);
    assert.deepEqual((await callAs(db, customer, "update customer_notifications set read_at=now() where read_at is null returning id")).rows, [{ id: first }]);
    assert.equal((await callAs(db, other, "select read_at from customer_notifications")).rows[0].read_at, null);
    await assert.rejects(callAs(db, customer, "update customer_notifications set title='False alert' where id=$1", [first]), { code: "42501" });
  } finally {
    await runtime.stop();
  }
});
