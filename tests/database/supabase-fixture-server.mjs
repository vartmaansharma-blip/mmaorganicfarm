// Test-only HTTP boundary for Supabase clients: native PostgreSQL supplies all
// business functions, triggers, constraints and RLS. This is not a GoTrue/PostgREST replacement.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Client, types } from "pg";
// PostgREST returns DATE fields as YYYY-MM-DD, without JS timezone conversion.
types.setTypeParser(1082, (value) => value);
const secret = "local-fixture-session-secret-never-used-in-production";
export function sessionFor(user) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const base = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: user, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 })}`;
  const access_token = `${base}.${createHmac("sha256", secret).update(base).digest("base64url")}`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "local-fixture-refresh",
    user: {
      id: user,
      aud: "authenticated",
      role: "authenticated",
      email: `${user}@fixture.invalid`,
      app_metadata: { provider: "email" },
      user_metadata: {},
      identities: [],
    },
  };
}
function identity(token) {
  try {
    const [a, b, c] = token.split(".");
    const expected = createHmac("sha256", secret).update(`${a}.${b}`).digest();
    const actual = Buffer.from(c, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const claims = JSON.parse(Buffer.from(b, "base64url"));
    return claims.exp > Date.now() / 1000 ? claims.sub : null;
  } catch {
    return null;
  }
}
const name = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Error("Invalid SQL identifier");
  return `"${s}"`;
};
function splitSelection(s) {
  let depth = 0,
    start = 0,
    parts = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    if (s[i] === ")") depth--;
    if (s[i] === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}
function selection(raw, alias = "t") {
  return splitSelection(raw)
    .map((field) => {
      const nested = field.match(
        /^(daily_delivery_items|weekly_delivery_items|scheduled_delivery_items|delivery_exceptions|delivery_pauses|order_items)\((.*)\)$/,
      );
      if (nested) {
        const [, table, fields] = nested;
        const key =
          table === "daily_delivery_items"
            ? "delivery_id"
            : table === "order_items"
              ? "order_id"
              : "plan_id";
        return `(select coalesce(jsonb_agg(jsonb_build_object(${fields
          .split(",")
          .map((f) => `'${f}',c.${name(f)}`)
          .join(
            ",",
          )})),'[]'::jsonb) from public.${name(table)} c where c.${name(key)}=${alias}.id) as ${name(table)}`;
      }
      if (field === "*") return `${alias}.*`;
      return `${alias}.${name(field)}`;
    })
    .join(",");
}
export async function startFixtureServer(config, { port = 55479 } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const user = identity(token);
    const service = token === "local-service-fixture";
    const send = (status, data) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
    };
    if (url.pathname.startsWith("/auth/v1/user")) {
      if (!user) return send(401, { message: "Invalid fixture session" });
      return send(200, sessionFor(user).user);
    }
    if (url.pathname.includes("jwks")) return send(200, { keys: [] });
    if (!url.pathname.startsWith("/rest/v1/"))
      return send(404, { message: "Fixture endpoint not supported" });
    const client = new Client(config);
    await client.connect();
    try {
      await client.query("begin");
      if (!service) {
        await client.query(`set local role ${user ? "authenticated" : "anon"}`);
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [user ?? ""],
        );
      }
      let result;
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = url.pathname.split("/").at(-1);
        if (
          !/^(get_milk_intake_workspace|get_milk_intake_history|milk_intake_command|get_farm_notifications|dismiss_farm_notifications|get_driver_run_workspace|driver_operations_command|save_my_delivery_pin|get_dispatch_routing_readiness|move_farm_prepaid_quantity|order_product_prices|update_farm_prices|correct_manual_payment_details|my_welcome_back_offer|apply_my_checkout_code|cancel_my_delivery_plan|record_driver_customer_request|review_driver_customer_request|run_nightly_dispatch_preparation|retry_dispatch_preparation|record_delivery_outcome|resolve_delivery_exception|get_delivery_reconciliation|close_delivery_day|get_delivery_exceptions|get_customer_delivery_outcomes|prepare_daily_dispatch|generate_daily_deliveries|release_daily_dispatch|assign_daily_route_driver|move_delivery_visit|reopen_daily_dispatch|product_capacity_snapshot)$/.test(
            fn,
          )
        )
          throw Error("Fixture RPC not permitted");
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw || "{}");
        const entries = Object.entries(body);
        const args = entries
          .map(([key], i) => `${name(key)} => $${i + 1}`)
          .join(",");
        result =
          fn === "product_capacity_snapshot"
            ? (
                await client.query(
                  `select * from public.${name(fn)}(${args})`,
                  entries.map(([, v]) => v),
                )
              ).rows
            : (
                await client.query(
                  `select public.${name(fn)}(${args}) value`,
                  entries.map(([key, v]) =>
                    (key === "p_payload" || key === "p_quantities" || key === "p_prices") && v !== null
                      ? JSON.stringify(v)
                      : v,
                  ),
                )
              ).rows[0].value;
      } else {
        const table = url.pathname.split("/").at(-1);
        const values = [],
          where = [];
        let order = "";
        for (const [key, v] of url.searchParams) {
          if (["select", "limit", "offset", "order", "on_conflict"].includes(key)) continue;
          const op = v.slice(0, v.indexOf(".")),
            value = v.slice(v.indexOf(".") + 1);
          if (["eq", "neq", "gte", "lte"].includes(op)) {
            values.push(value);
            where.push(
              `t.${name(key)} ${({eq:"=",neq:"<>",gte:">=",lte:"<="})[op]} $${values.length}`,
            );
          } else if (op === "in") {
            values.push(value.slice(1, -1).split(","));
            where.push(`t.${name(key)}::text=any($${values.length}::text[])`);
          } else throw Error(`Unsupported fixture filter ${op}`);
        }
        if (url.searchParams.has("order"))
          order =
            " order by " +
            url.searchParams
              .get("order")
              .split(",")
              .map((o) => {
                const [k, d] = o.split(".");
                return `t.${name(k)} ${d === "desc" ? "desc" : "asc"}`;
              })
              .join(",");
        const limit = Math.min(
          1000,
          Number(url.searchParams.get("limit") || 1000),
        );
        const offset = Number(url.searchParams.get("offset") || 0);
        if (req.method === "POST" || req.method === "DELETE") {
          if (!service || !["production_capacity", "production_capacity_overrides"].includes(table)) throw Error("Fixture table write not permitted");
          if (req.method === "DELETE") {
            if (!where.length) throw Error("Fixture delete requires a key");
            result = (await client.query(`delete from public.${name(table)} t where ${where.join(" and ")} returning *`,values)).rows;
          } else {
            let raw="";for await(const chunk of req) raw+=chunk;
            const row=JSON.parse(raw);const keys=Object.keys(row);
            if(keys.some(key=>!["product_key","delivery_date","daily_limit","updated_at","updated_by"].includes(key))) throw Error("Fixture write field not permitted");
            const conflict=table==="production_capacity"?["product_key"]:["product_key","delivery_date"];
            result=(await client.query(`insert into public.${name(table)} (${keys.map(name).join(",")}) values (${keys.map((_,i)=>`$${i+1}`).join(",")}) on conflict (${conflict.map(name).join(",")}) do update set ${keys.filter(k=>!conflict.includes(k)).map(k=>`${name(k)}=excluded.${name(k)}`).join(",")} returning *`,keys.map(k=>row[k]))).rows;
          }
        } else {
        if(req.headers.prefer?.includes("count=exact")) {
          const count=(await client.query(`select count(*)::integer total from public.${name(table)} t ${where.length?"where "+where.join(" and "):""}`,values)).rows[0].total;
          res.setHeader("content-range",`${offset}-${Math.max(offset,offset+Math.min(limit,count)-1)}/${count}`);
        }
        const sql = `select ${selection(url.searchParams.get("select") || "*")} from public.${name(table)} t ${where.length ? "where " + where.join(" and ") : ""}${order} limit ${limit} offset ${offset}`;
        result = (await client.query(sql, values)).rows;
        }
        if (req.headers.accept?.includes("application/vnd.pgrst.object+json"))
          result = result.length === 1 ? result[0] : null;
      }
      await client.query("commit");
      send(200, result);
    } catch (error) {
      await client.query("rollback");
      send(error.code === "42501" ? 403 : 400, {
        message: error.message,
        code: error.code ?? "FIXTURE_ERROR",
        details: null,
        hint: null,
      });
    } finally {
      await client.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
