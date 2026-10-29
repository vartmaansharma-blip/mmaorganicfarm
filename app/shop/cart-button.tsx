"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { OutlineIcon } from "@/app/components/outline-icon";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import {
  cartCount,
  combinedCartOrderHref,
  cartOrderHref,
  cartQuote,
  cartReady,
  cartRoutines,
  selectedShopCart,
  shiftShopPlan,
} from "@/lib/shop-cart";
import { SharedCalendar } from "./shared-calendar";
import { shopProduct } from "@/lib/shop-products";
import { type ShopProductId } from "@/lib/shop-draft";
import { useShop } from "./shop-state";
import styles from "./cart.module.css";
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export function CartButton() {
  const { state, update, cartOpen, setCartOpen, prices, firstPlanStart } = useShop();
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const mode = state.mode,
    cart = state.carts[mode],
    selected = selectedShopCart(cart),
    count = cartCount(cart),
    quote = cartQuote(cart, mode, firstPlanStart, prices),
    selectedQuote = cartQuote(selected, mode, firstPlanStart, prices),
    routines = cartRoutines(cart),
    minimum = nextDeliveryDateInIndia();
  const onceSelected = selectedShopCart(state.carts.once);
  const planSelected = selectedShopCart(state.carts.plan);
  const bothSelected = cartCount(onceSelected) > 0 && cartCount(planSelected) > 0;
  const bothReady = bothSelected && cartReady(onceSelected, "once", minimum)
    && cartReady(planSelected, "plan", minimum);
  useEffect(() => {
    if (cartOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!cartOpen && dialog.current?.open) dialog.current?.close();
    if (!cartOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [cartOpen]);
  function changeCart(next: typeof cart) {
    const drafts = { ...state.drafts[mode] };
    for (const id of ["milk", "paneer", "ghee"] as const) {
      const item = next[id];
      if (!item) continue;
      drafts[id] =
        id === "milk"
          ? { ...next.milk! }
          : {
              ...drafts[id],
              quantity: item.quantity,
              repeat: item.repeat,
              dates: item.dates,
              start: next[id]!.firstDate ?? next.start,
              schedule: (next[id]!.week ??
                drafts[id].schedule) as typeof drafts.milk.schedule,
            };
    }
    update({
      ...state,
      carts: { ...state.carts, [mode]: next },
      drafts: { ...state.drafts, [mode]: drafts },
    });
  }
  function quantity(id: ShopProductId, quantity: number) {
    if (id === "milk" && cart.milk)
      changeCart({
        ...cart,
        milk: {
          ...cart.milk,
          quantity,
          schedule: cart.milk.schedule.map((q) =>
            q > 0 ? quantity : 0,
          ) as typeof cart.milk.schedule,
        },
      });
    else if (id !== "milk" && cart[id])
      changeCart({ ...cart, [id]: { ...cart[id], quantity } });
  }
  const productSubtotal = selectedQuote.total - selectedQuote.deliveryCharge;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Open cart, ${count} ${count === 1 ? "product" : "products"}`}
        aria-haspopup="dialog"
        aria-expanded={cartOpen}
        aria-controls="shop-cart"
        onClick={() => setCartOpen(true)}
      >
        <OutlineIcon name="cart" />
        <span className={styles.triggerLabel}>Cart</span>
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>
      </button>
      <dialog
        ref={dialog}
        id="shop-cart"
        className={styles.drawer}
        aria-labelledby="cart-title"
        onClose={() => {
          setCartOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            setCartOpen(false);
        }}
      >
        <div className={styles.heading}>
          <div>
            <p>M’ma Organic Farm</p>
            <h2 id="cart-title">
              Your cart<span>.</span>
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          >
            ×
          </button>
        </div>
        <div className={styles.modes} role="group" aria-label="Cart order type">
          {(["once", "plan"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => update({ ...state, mode: value })}
            >
              {value === "plan" ? "Scheduled" : "One-time"}{" "}
              <span>({cartCount(state.carts[value])})</span>
            </button>
          ))}
        </div>
        {!count ? (
          <div className={styles.empty}>
            <OutlineIcon name="cart" size={40} />
            <h3>Good things belong here.</h3>
            <p>Add milk, paneer or ghee from the counter.</p>
            <Link href="/shop" onClick={() => setCartOpen(false)}>
              Explore the shop →
            </Link>
          </div>
        ) : (
          <>
            <ul className={styles.items}>
              {(["milk", "paneer", "ghee"] as const).map((id) => {
                const item = cart[id];
                if (!item) return null;
                const p = shopProduct(id, prices);
                const variable =
                  id === "milk" &&
                  mode === "plan" &&
                  cart.milk &&
                  routines.find((r) => r.id === "milk")?.repeat === "days" &&
                  new Set(cart.milk.schedule.filter((q) => q > 0)).size > 1;
                return (
                  <li key={id}>
                    <label className={styles.selectItem}>
                      <input
                        type="checkbox"
                        checked={cart.selected[id]}
                        onChange={(event) => changeCart({
                          ...cart,
                          selected: { ...cart.selected, [id]: event.target.checked },
                        })}
                      />
                      <span className={styles.visuallyHidden}>Select {p.name} for checkout</span>
                    </label>
                    <Image src={p.image} alt="" width={68} height={82} />
                    <div className={styles.itemBody}>
                      <Link
                        href={`/shop/${id}`}
                        onClick={() => setCartOpen(false)}
                      >
                        <OutlineIcon name={id} size={18} />
                        {p.name}
                      </Link>
                      <p>
                        {mode === "plan"
                          ? `${id === "milk" ? "Litres" : "500 g"} · ${routines.find((r) => r.id === id)?.repeat === "custom" ? "Your selected dates" : routines.find((r) => r.id === id)?.repeat === "days" ? "Selected weekdays" : (routines.find((r) => r.id === id)?.repeat ?? "Scheduled")}`
                          : id === "milk"
                            ? "Litres"
                            : "500 g · One delivery"}
                      </p>
                      <p className={styles.linePrice}>
                        {money(
                          id === "milk"
                            ? quote.milkTotal
                            : (quote.productTotals[id] ?? 0),
                        )}
                      </p>
                      <div className={styles.itemActions}>
                        {variable ? (
                          <span className={styles.variable}>
                            Litres vary by day
                          </span>
                        ) : (
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              disabled={item.quantity <= 1}
                              aria-label={`Decrease cart ${id} quantity`}
                              onClick={() => quantity(id, item.quantity - 1)}
                            >
                              −
                            </button>
                            <output>{item.quantity}</output>
                            <button
                              type="button"
                              disabled={item.quantity >= 5}
                              aria-label={`Increase cart ${id} quantity`}
                              onClick={() => quantity(id, item.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Remove ${p.name}`}
                          onClick={() => changeCart({ ...cart, [id]: null })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <label className={styles.date}>
              {mode === "plan" ? "Plan starts" : "Delivery date"}
              <input
                type="date"
                min={minimum}
                value={cart.start}
                onChange={(e) =>
                  mode === "plan"
                    ? update(shiftShopPlan(state, e.target.value))
                    : changeCart({ ...cart, start: e.target.value })
                }
              />
            </label>
            {mode === "plan" ? (
              <details className={styles.calendar}>
                <summary>View your shared calendar</summary>
                <SharedCalendar start={cart.start} rules={routines} />
              </details>
            ) : null}
            {cart.milk && (!cart.paneer || !cart.ghee) ? (
              <section
                className={styles.suggestions}
                aria-labelledby="cart-suggestions"
              >
                <h3 id="cart-suggestions">Complete your basket.</h3>
                <p>Something for the kitchen, too?</p>
                {(["paneer", "ghee"] as const)
                  .filter((id) => !cart[id])
                  .map((id) => {
                    const p = shopProduct(id, prices);
                    return (
                      <Link
                        key={id}
                        href={`/shop/${id}`}
                        onClick={() => setCartOpen(false)}
                        aria-label={`Choose ${p.name}, ${p.unit}, ${money(p.price)}`}
                      >
                        <Image src={p.image} alt="" width={52} height={62} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.unit} · {money(p.price)}
                          </small>
                        </span>
                        <span className={styles.choose}>
                          Choose <span aria-hidden="true">→</span>
                        </span>
                      </Link>
                    );
                  })}
              </section>
            ) : null}
            <div className={styles.bottom}>
              <div>
                <span>
                  {mode === "plan" ? "Selected plan products" : "Selected products subtotal"}
                </span>
                <strong>{money(productSubtotal)}</strong>
              </div>
              <p>
                {mode === "plan"
                  ? "First month: no delivery, platform, surge or miscellaneous fees. After that, ₹2 per delivery, free above ₹199 in products per delivery."
                  : "Delivery ₹5, free above ₹199 in products."}{" "}
                Your eligibility and full total are confirmed before payment.
              </p>
              {cartReady(selected, mode, minimum) ? (
                <Link
                  className={styles.checkout}
                  href={cartOrderHref(selected, mode)}
                  onClick={() => setCartOpen(false)}
                >
                  Checkout selected items <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <button className={styles.checkout} type="button" disabled>
                  {cartCount(selected) ? "Complete your schedule" : "Select items to checkout"}
                </button>
              )}
              {bothSelected ? (
                <div className={styles.combinedChoice}>
                  <p>Want one payment for your one-time and prepaid scheduled items?</p>
                  {bothReady ? (
                    <Link href={combinedCartOrderHref(onceSelected, planSelected)}
                      onClick={() => setCartOpen(false)}>
                      Checkout both selected carts together →
                    </Link>
                  ) : (
                    <span>Complete both delivery dates and schedules to pay together.</span>
                  )}
                </div>
              ) : null}
              <p className={styles.saved}>
                Unselected items stay in your cart. Nothing is charged yet.
              </p>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
