import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

export const baselineFiles = [
  "customer_profiles",
  "delivery_plans",
  "delivery_calendar",
  "farm_dashboard",
  "daily_deliveries",
  "checkout_payments",
  "production_capacity",
  "paid_plan_adjustments",
  "paid_one_time_deliveries",
  "shopify_commerce",
  "driver_delivery_workflow",
  "operations_completion",
  "daily_dispatch",
  "daily_dispatch_performance",
  "production_capacity_hardening",
  "test_order_mode",
  "essential_farm_operations",
  "essential_farm_operations_security",
  "operations_hardening",
  "driver_delivery_workflow_security",
  "end_to_end_operations_reliability",
  "operational_delivery_visits",
  "multi_product_capacity",
  "next_day_delivery_start",
  "route_dispatch_workbench",
  "route_retirement_audit",
  "monthly_product_schedules",
];
export async function createDatabase() {
  const require = createRequire(import.meta.url);
  const binaryRoot = path.resolve(
    path.dirname(
      require.resolve(`@embedded-postgres/${process.platform}-${process.arch}`),
    ),
    "..",
  );
  execFileSync(
    process.execPath,
    [path.join(binaryRoot, "scripts/hydrate-symlinks.js")],
    { cwd: binaryRoot },
  );
  const dir = await mkdtemp(path.join(os.tmpdir(), "mma-reconciliation-"));
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = Number(
    process.env.RECONCILIATION_DB_PORT || socket.address().port,
  );
  await new Promise((resolve) => socket.close(resolve));
  const server = new EmbeddedPostgres({
    databaseDir: path.join(dir, "pg"),
    user: "postgres",
    password: "local-fixture-only",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  const config = {
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "local-fixture-only",
    database: "postgres",
  };
  const db = new Client(config);
  await db.connect();
  try {
    await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create schema private;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
 grant usage on schema public,auth,private to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;`);
    for (const name of baselineFiles) {
      try {
        await db.query(
          await readFile(
            new URL(`../../supabase/${name}.sql`, import.meta.url),
            "utf8",
          ),
        );
      } catch (error) {
        throw new Error(`Baseline ${name}: ${error.message}`, { cause: error });
      }
    }
    const migration = await readFile(
      new URL(
        "../../supabase/migrations/20261024191731_daily_delivery_reconciliation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(migration);
    await db.query(
      await readFile(
        new URL(
          "../../supabase/migrations/20261025101515_nightly_dispatch_preparation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query(
      await readFile(
        new URL(
          "../../supabase/migrations/20261025102357_driver_customer_requests.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query(await readFile(new URL("../../supabase/migrations/20261026060953_customer_plan_cancellation.sql", import.meta.url), "utf8"));
    await db.query(await readFile(new URL("../../supabase/migrations/20261026062639_welcome_back_checkout_code.sql", import.meta.url), "utf8"));
    await db.query(await readFile(new URL("../../supabase/migrations/20261026111243_retire_welcome_back_discount.sql", import.meta.url), "utf8"));
    await db.query(await readFile(new URL("../../supabase/migrations/20261026112857_farm_operational_editors.sql", import.meta.url), "utf8"));
  } catch (error) {
    await db.end();
    await server.stop();
    throw error;
  }
  return {
    db,
    config,
    async stop() {
      await db.end();
      await server.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
export async function callAs(db, user, sql, values = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
      user || "",
    ]);
    const r = await db.query(sql, values);
    await db.query("commit");
    return r;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
