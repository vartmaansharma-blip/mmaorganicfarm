import Link from "next/link";
import { redirect } from "next/navigation";
import { NavigationMenu } from "@/app/components/navigation-menu";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { normalizeReferralCode, readReferralWorkspace, referralsEnabled } from "@/lib/referrals";
import { createClient } from "@/lib/supabase/server";
import { CustomerNotificationBell } from "../notifications/notification-bell";
import account from "../account.module.css";
import { claimReferralCode, createReferralCode } from "./actions";
import { ShareCode } from "./share-code";
import styles from "./referrals.module.css";

export const metadata = { title: "Refer & Earn", robots: { index: false, follow: false } };

export default async function ReferralsPage({ searchParams }: {
  searchParams: Promise<{ code?: string; error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const code = normalizeReferralCode(params.code);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const next = code ? `/account/referrals?code=${code}` : "/account/referrals";
  if (!user && code) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const workspace = user ? await readReferralWorkspace(client) : null;
  const enabled = workspace?.enabled ?? await referralsEnabled();
  const inviteUrl = workspace?.code
    ? new URL(`/account/referrals?code=${workspace.code}`, process.env.NEXT_PUBLIC_SITE_URL || "https://mmaorganicfarm.vercel.app").href
    : "";

  return <main className={account.page}>
    <header className={account.header}>
      <Link className={account.brand} href={user ? "/account" : "/"}>M&apos;ma Organic Farm</Link>
      <div className="customer-header-actions">
        <CustomerNotificationBell />
        <NavigationMenu current="/account/referrals" />
      </div>
    </header>
    <section className={account.content}>
      <p className={account.eyebrow}>My M’ma</p>
      <h1 className={styles.title}>Refer &amp; Earn</h1>
      <p className={account.intro}>Invite someone to the monthly scheduled plan. Rewards unlock after their first paid delivery is completed.</p>
      {params.error ? <p className={account.notice} role="alert">{params.error}</p> : null}
      {params.message ? <p className={account.notice} role="status">{params.message}</p> : null}
      {!enabled ? <section className={styles.panel}><h2>New invites are paused</h2><p>You can still see rewards from an existing invite below.</p></section> : null}
      {enabled && !user ? <Link className={styles.primary} href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to refer a friend</Link> : null}
      {workspace && (enabled || workspace.code) ? <section className={styles.panel}>
        <h2>Your invite</h2>
        {enabled && workspace.referrer_paise > 0 ? <p>{formatCheckoutAmount(workspace.referrer_paise)} for each qualifying invite.</p> : null}
        {enabled && workspace.newcomer_paise > 0 ? <p>Your friend can unlock {formatCheckoutAmount(workspace.newcomer_paise)}.</p> : null}
        {enabled ? workspace.code ? <ShareCode code={workspace.code} inviteUrl={inviteUrl} /> : <form action={createReferralCode}>
          <button className={styles.primary} type="submit">Create invite link</button>
        </form> : null}
        {workspace.code ? <dl className={styles.metrics}>
          <div><dt>Invites linked</dt><dd>{workspace.invites}</dd></div>
          <div><dt>Qualified invites</dt><dd>{workspace.unlocked_invites}</dd></div>
          <div><dt>Rewards unlocked</dt><dd>{formatCheckoutAmount(workspace.earned_paise)}</dd></div>
        </dl> : null}
      </section> : null}
      {workspace && (enabled || workspace.claim) ? <section className={styles.panel}>
        <h2>Invited by a friend?</h2>
        {workspace.claim ? <>
          <p>{workspace.claim.unlocked ? "First paid delivery completed." : "Code linked. Complete your first paid delivery on the monthly scheduled plan."}</p>
          {workspace.claim.reward_paise > 0 ? <strong>{formatCheckoutAmount(workspace.claim.reward_paise)} {workspace.claim.unlocked ? "unlocked" : "pending"}</strong> : null}
          {!workspace.claim.unlocked ? <Link className={styles.primary} href="/shop">Shop monthly deliveries</Link> : null}
        </> : <form className={styles.claim} action={claimReferralCode}>
          <label>Referral code<input name="code" autoCapitalize="characters" autoComplete="off" spellCheck={false} required maxLength={32} defaultValue={code} /></label>
          <button className={styles.primary} type="submit">Link code</button>
        </form>}
      </section> : null}
    </section>
  </main>;
}
