"use client";

import Link from "next/link";
import Image from "next/image";
import { SHOP_PRODUCTS } from "@/lib/shop-products";
import { NotificationIcon } from "./notifications/notification-icon";
import { useActionState, useRef, useState } from "react";
import { formatCalendarDate, productName } from "@/lib/delivery-calendar";
import { changeProducts, requestStatus, type ChangeProduct, type TodayManagement } from "@/lib/today-delivery-management";
import { checkTodayRouteStock, requestTodayDelivery, type TodayActionState } from "./today-delivery-actions";
import styles from "./account.module.css";

export function TodayDeliveryEditor({ management, stale, onSaved }: {
  management: TodayManagement;
  stale: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = management.deliveries.some(delivery => delivery.editable);
  const hasDelivery = management.deliveries.length > 0;

  if (!hasDelivery && !management.requests.length) return null;
  return <section className={styles.todayEditor} aria-label="Manage today's delivery">
    {hasDelivery ? <button className={styles.todayEditButton} type="button" aria-expanded={editing} aria-controls="today-change-form"
      onClick={() => setEditing(open => !open)}>
      {editing ? "Close delivery request" : canEdit ? "Modify today’s delivery" : "Report a delivery issue"}
    </button> : null}
    {hasDelivery && !editing ? <Link className={styles.todayUpcomingButton} href="/account?section=schedule">Manage upcoming deliveries</Link> : null}
    {editing && hasDelivery ? <DeliveryChangeForm management={management} stale={stale} onSaved={onSaved} /> : null}
    {management.requests.length ? <ul className={styles.todayRequestList} aria-label="Your delivery requests">
      {management.requests.map(request => <li key={request.id + request.status} data-status={request.status}>
        <div className={styles.todayRequestHeading}>
          <strong>{request.product_key ? productName(request.product_key) : "Delivery issue"}</strong>
          <span className={styles.todayRequestBadge}>
            <NotificationIcon name={request.status === "applied" || request.status === "resolved" ? "check" : request.status === "declined" ? "close" : "attention"} size={15} />
            {requestStatus[request.status]}
          </span>
        </div>
        {request.product_key && request.previous_quantity !== null && request.requested_quantity !== null
          ? <QuantityComparison product={request.product_key} from={request.previous_quantity} to={request.requested_quantity}
              confirmed={request.status === "applied"} /> : null}
        {request.moved_to ? <small>{formatCalendarDate(request.moved_to)} · {Number(request.previous_quantity) - Number(request.requested_quantity)} {request.product_key === "milk" ? "L" : "pack(s)"} moved · Payment unchanged</small> : null}
        {request.decision_note ? request.status === "applied"
          ? <details className={styles.todayFarmNote}><summary>Farm note</summary><small>{request.decision_note}</small></details>
          : <small>{request.decision_note}</small> : null}
      </li>)}
    </ul> : null}
  </section>;
}

function QuantityComparison({ product, from, to, confirmed = false }: {
  product: ChangeProduct; from: number; to: number; confirmed?: boolean;
}) {
  const unit = product === "milk" ? "L" : "packs";
  return <dl className={styles.quantityComparison} aria-label={`${productName(product)} quantity change`}>
    <div><dt>{confirmed ? "Before" : "Current"}</dt><dd>{Number(from)} {unit}</dd></div>
    <div><dt>{confirmed ? "Confirmed" : "Requested"}</dt><dd><span className={styles.quantityArrow} aria-hidden="true">→</span><strong>{Number(to)} {unit}</strong></dd></div>
  </dl>;
}

function DeliveryChangeForm({ management, stale, onSaved }: {
  management: TodayManagement;
  stale: boolean;
  onSaved: () => void;
}) {
  const [deliveryId, setDeliveryId] = useState(management.deliveries.find(row => row.editable)?.id ?? management.deliveries[0]?.id);
  const [mode, setMode] = useState<"quantity" | "issue">("quantity");
  const [product, setProduct] = useState<ChangeProduct>("milk");
  const [draft, setDraft] = useState<string | null>(null);
  const selectedProduct = SHOP_PRODUCTS.find(item => item.id === product);
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const [stock, setStock] = useState<number | null>(null);
  const key = useRef<{ signature: string; id: string } | null>(null);
  const delivery = management.deliveries.find(row => row.id === deliveryId);
  const issue = mode === "issue" || !delivery?.editable;
  const expected = Number(delivery?.items.find(item => item.product_key === product)?.quantity ?? 0);
  const quantity = draft === null ? expected : Number(draft);
  const addition = !issue && quantity > expected;
  const extra = Math.round((quantity - expected) * 100) / 100;
  const unit = product === "milk" ? "L" : "packs";
  const hasOpenRequest = management.requests.some(request => request.delivery_id === deliveryId
    && request.product_key === (issue ? null : product) && request.status === "requested");
  const valid = Boolean(delivery && !stale && (addition || !hasOpenRequest) && (issue ? note.trim().length >= 3
    : draft !== "" && Number.isFinite(quantity) && quantity >= 0 && quantity <= 5 && quantity !== expected));
  const [result, submit, pending] = useActionState(async (): Promise<TodayActionState> => {
    if (!valid || !delivery) return { ok: false, message: "Refresh today’s delivery and review your request." };
    if (addition) {
      try {
        const quote = await checkTodayRouteStock(delivery.id, product);
        if (quote.error) return { ok: false, message: quote.error };
        setStock(quote.available);
        setReview(true);
        return { ok: true, message: "" };
      } catch {
        return { ok: false, message: "We couldn’t check the driver’s stock. Reconnect and try again." };
      }
    }
    const input = { delivery: delivery.id, product: issue ? null : product, expected: issue ? null : expected,
      quantity: issue ? null : quantity, note: issue ? note.trim() : "" };
    const signature = JSON.stringify(input);
    if (key.current?.signature !== signature) key.current = { signature, id: crypto.randomUUID() };
    try {
      const response = await requestTodayDelivery({ ...input, id: key.current.id });
      if (response.ok) {
        setReview(false);
        setDraft(null);
        setNote("");
        onSaved();
        window.dispatchEvent(new Event("mma:notifications-updated"));
      }
      return response;
    } catch {
      return { ok: false, message: "We couldn’t confirm the request. Reconnect and retry with the same details." };
    }
  }, null);

  return <form id="today-change-form" className={styles.todayChangeForm} action={submit}
    onSubmit={event => { if (!review && !addition) { event.preventDefault(); setReview(true); } }}>
    <fieldset disabled={pending || stale}>
      <legend>{review ? addition ? "Driver stock" : "Review your request" : "Change this delivery only"}</legend>
      {review ? <>
        {issue ? <p>{note.trim()}</p> : <>
          <div className={styles.reviewProduct}>
            {selectedProduct ? <Image src={selectedProduct.image} width={38} height={38} alt="" loading="eager" /> : null}
            <strong>{productName(product)}</strong>
          </div>
          {addition ? <dl className={styles.quantityComparison} aria-label="Requested and available stock">
            <div><dt>You want to add</dt><dd>{extra} {unit}</dd></div>
            <div><dt>Driver can offer</dt><dd>{stock === null ? "Unverified" : `${stock} ${unit}`}</dd></div>
          </dl> : <QuantityComparison product={product} from={expected} to={quantity} />}
        </>}
        {addition ? stock !== null && stock > 0 && stock < extra
          ? <p><strong>Would you like to take {stock} {unit} instead?</strong></p>
          : <p>{stock === null ? "We can only check spare stock once your driver is on the route."
            : stock === 0 ? "The driver has no spare stock for this product." : "The checked stock covers this amount. Same-day payment is currently unavailable."}</p>
          : <p>Farm confirmation required. Payment unchanged for now.</p>}
      </> : <>
        {management.deliveries.length > 1 ? <label>Delivery
          <select value={deliveryId} onChange={event => { setDeliveryId(event.target.value); setDraft(null); }}>
            {management.deliveries.map((row, index) => <option key={row.id} value={row.id}>{row.type} · delivery {index + 1}</option>)}
          </select>
        </label> : null}
        {delivery?.editable ? <label>What do you need?
          <select value={mode} onChange={event => { setMode(event.target.value as typeof mode); setDraft(null); }}>
            <option value="quantity">Change a product quantity</option><option value="issue">Report a delivery issue</option>
          </select>
        </label> : null}
        {issue ? <label>What happened?<textarea rows={3} maxLength={300} required value={note} onChange={event => setNote(event.target.value)} /></label>
          : <div className={styles.todayChangeFields}>
            <label>Product<select value={product} onChange={event => { setProduct(event.target.value as ChangeProduct); setDraft(null); }}>
              {changeProducts.map(value => <option key={value} value={value}>{productName(value)}</option>)}
            </select></label>
            <label>{product === "milk" ? "Requested litres" : "Requested packs"}
              <input type="number" inputMode={product === "milk" ? "decimal" : "numeric"} min={0} max={5} step={product === "milk" ? 0.01 : 1}
                value={draft ?? expected} onChange={event => setDraft(event.target.value)} required />
            </label>
          </div>}
        {!issue ? <p>Use 0 to request removal. This request applies to today only.</p> : null}
      </>}
      {hasOpenRequest && !addition ? <p>This item already has a request awaiting the farm.</p> : null}
      <div className={styles.todayChangeButtons}>
        {review ? <button type="button" onClick={() => setReview(false)}>Back</button> : null}
        {review && addition ? stock !== null && stock > 0 && stock < extra ? <button
          className={styles.todayEditButton} type="button"
          onClick={() => setDraft(String(Math.round((expected + stock) * 100) / 100))}>
          Choose {stock} {unit}
        </button> : null : <button className={styles.todayEditButton} type="submit" disabled={!valid || pending}>
          {pending ? addition ? "Checking stock…" : "Sending…" : addition ? "Check driver stock" : review ? "Send to the farm" : "Review request"}
        </button>}
      </div>
    </fieldset>
    {stale ? <p role="status">Refresh delivery updates before sending a request.</p> : null}
    {result?.message ? <p role={result.ok ? "status" : "alert"}>{result.message}</p> : null}
  </form>;
}
