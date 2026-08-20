import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteDriver, setDriverActive } from "./actions";
import styles from "./staff.module.css";

export const metadata: Metadata = { title: "Farm staff", robots: { index: false, follow: false } };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { role } = await requireFarmManager("/farm/staff");
  const params = await searchParams;
  const admin = createAdminClient();
  const [{ data: staff, error }, { data: profiles }] = await Promise.all([
    admin.from("farm_staff").select("user_id,role,active,updated_at").order("active", { ascending: false }).order("role"),
    admin.from("customer_profiles").select("user_id,full_name,email"),
  ]);
  if (error) throw error;
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const drivers = (staff ?? []).filter((person) => person.role === "driver");

  return <main className={styles.page}>
    <header><div><p>Access control</p><h1>Farm staff</h1><span>Invite drivers, control access, then assign each active route from the Routes page.</span></div><Link href="/farm/routes">Open routes</Link></header>
    {params.message ? <p className={styles.notice}>{params.message}</p> : null}
    {params.error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{params.error}</p> : null}

    <section className={styles.summary}><article><strong>{drivers.filter((driver) => driver.active).length}</strong><span>Active drivers</span></article><article><strong>{drivers.filter((driver) => !driver.active).length}</strong><span>Inactive drivers</span></article></section>

    {role === "admin" ? <section className={styles.invite}><div><p>Driver onboarding</p><h2>Invite a driver securely</h2><span>The driver receives an email to create their password. No shared password is stored or shown to the manager.</span></div><form action={inviteDriver}><label>Driver name<input name="fullName" required /></label><label>Email address<input name="email" required type="email" /></label><button type="submit">Send driver invitation</button></form></section> : null}

    <section className={styles.list} aria-label="Driver accounts">{drivers.length ? drivers.map((driver) => { const profile = profileById.get(driver.user_id); return <article data-inactive={!driver.active} key={driver.user_id}><div><strong>{profile?.full_name ?? "Driver"}</strong><span>{profile?.email ?? "Email unavailable"}</span></div><b>{driver.active ? "Active" : "Inactive"}</b>{role === "admin" ? <form action={setDriverActive}><input name="userId" type="hidden" value={driver.user_id} /><input name="active" type="hidden" value={driver.active ? "false" : "true"} /><button type="submit">{driver.active ? "Deactivate" : "Restore access"}</button></form> : null}</article>; }) : <p className={styles.empty}>No driver accounts yet. Invite the first driver before preparing morning dispatch.</p>}</section>
  </main>;
}
