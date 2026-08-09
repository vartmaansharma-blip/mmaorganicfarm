import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

type RazorpayOrder = { amount: number; currency: string; id: string; status: string };
type RazorpayPayment = { amount: number; currency: string; id: string; order_id: string; status: string };
export function hasRazorpayConfig() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }
export function hasRazorpayWebhookConfig() { return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET); }
function credentials() { const keyId = process.env.RAZORPAY_KEY_ID; const keySecret = process.env.RAZORPAY_KEY_SECRET; if (!keyId || !keySecret) throw new Error("Razorpay server credentials are not configured."); return { keyId, keySecret }; }
async function razorpayRequest<T>(path: string, init?: RequestInit) { const { keyId, keySecret } = credentials(); const response = await fetch(`https://api.razorpay.com/v1${path}`, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json", ...init?.headers }, cache: "no-store" }); if (!response.ok) throw new Error(`Razorpay request failed with status ${response.status}.`); return await response.json() as T; }
export function createRazorpayOrder(input: { amount: number; receipt: string }) { return razorpayRequest<RazorpayOrder>("/orders", { body: JSON.stringify({ amount: input.amount, currency: "INR", notes: { order_id: input.receipt }, receipt: input.receipt }), method: "POST" }); }
export function getRazorpayPayment(paymentId: string) { return razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`); }
function match(actual: string, expected: string) { const a = Buffer.from(actual); const e = Buffer.from(expected); return a.length === e.length && timingSafeEqual(a, e); }
export function verifyPaymentSignature(input: { paymentId: string; providerOrderId: string; signature: string }) { const expected = createHmac("sha256", credentials().keySecret).update(`${input.providerOrderId}|${input.paymentId}`).digest("hex"); return match(input.signature, expected); }
export function verifyWebhookSignature(body: string, signature: string) { const secret = process.env.RAZORPAY_WEBHOOK_SECRET; if (!secret) return false; return match(signature, createHmac("sha256", secret).update(body).digest("hex")); }
export function publicRazorpayKey() { return credentials().keyId; }
