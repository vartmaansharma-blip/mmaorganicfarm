"use client";
import { deliveryThresholdCopy, waiveSharedDelivery } from "@/lib/delivery-pricing";
import { DEFAULT_ORDER_FEES } from "@/lib/product-prices";
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
  type ShopCart,
  cartRoutines,
  selectedShopCart,
  shiftShopPlan,
} from "@/lib/shop-cart";
import { SharedCalendar } from "./shared-calendar";
import { shopProduct } from "@/lib/shop-products";
import { type ShopMode, type ShopProductId } from "@/lib/shop-draft";
import { useShop } from "./shop-state";
import styles from "./cart.module.css";
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export function CartButton() {
  const { state, update, cartOpen, setCartOpen, prices, firstPlanStart } = useShop();
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const modes = (["once", "plan"] as const).filter((mode) => cartCount(state.carts[mode]) > 0);
  const count = cartCount(state.carts.once) + cartCount(state.carts.plan);
  const minimum = nextDeliveryDateInIndia();
  const suggestionMode = modes.includes(state.mode) ? state.mode : modes[0];
  const suggestionCart = suggestionMode ? state.carts[suggestionMode] : null;
  const selectedCarts = {
    once: selectedShopCart(state.carts.once),
    plan: selectedShopCart(state.carts.plan),
  };
  const selectedModes = (["once", "plan"] as const).filter((key) => cartCount(selectedCarts[key]) > 0);
  const bothSelected = selectedModes.length === 2;
  const checkoutMode = selectedModes[0] ?? state.mode;
  const selectedBase = cartQuote(selectedCarts[checkoutMode], checkoutMode, firstPlanStart, prices);
  const scheduledBase = bothSelected ? cartQuote(selectedCarts.plan, "plan", firstPlanStart, prices) : null;
  const shared = scheduledBase && "deliveryByDate" in scheduledBase
    ? waiveSharedDelivery(selectedBase, scheduledBase, selectedCarts.once.start) : null;
  const selectedQuote = shared?.once ?? selectedBase;
  const scheduledQuote = shared?.scheduled ?? scheduledBase;
  const checkoutReady = selectedModes.length > 0 && selectedModes.every((key) => cartReady(selectedCarts[key], key, minimum));
  const checkoutHref = bothSelected
    ? combinedCartOrderHref(selectedCarts.once, selectedCarts.plan)
    : cartOrderHref(selectedCarts[checkoutMode], checkoutMode);
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
  function changeCart(mode: ShopMode, next: ShopCart) {
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
  function quantity(mode: ShopMode, id: ShopProductId, quantity: number) {
    const cart = state.carts[mode];
    if (id === "milk" && cart.milk)
      changeCart(mode, {
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
      changeCart(mode, { ...cart, [id]: { ...cart[id], quantity } });
  }
  function browseMode(mode: ShopMode) {
    if (state.mode !== mode) update({ ...state, mode });
    setCartOpen(false);
  }
  const productSubtotal = selectedQuote.total - selectedQuote.deliveryCharge - selectedQuote.handlingCharge - selectedQuote.platformCharge;
  const deliveryPolicy = checkoutMode === "plan"
    ? `First scheduled month has a fee waiver. After that, delivery is ₹${prices.delivery_scheduled ?? DEFAULT_ORDER_FEES.delivery_scheduled} per delivery.`
    : `Delivery is ₹${prices.delivery_once ?? DEFAULT_ORDER_FEES.delivery_once}.`;
  const checkoutNote = !selectedModes.length
    ? "Select a product to continue."
    : !checkoutReady
      ? "Check the delivery dates and schedule for your selected items."
      : bothSelected
        ? shared?.sharedDate
          ? "One payment. Delivery is free on the date both orders share."
          : "One payment for your one-time and scheduled items."
        : `${deliveryPolicy} ${deliveryThresholdCopy(prices)} Your total is confirmed before payment.`;
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
            {modes.map((mode) => {
              const cart = state.carts[mode];
              const routines = cartRoutines(cart);
              const quote = cartQuote(cart, mode, firstPlanStart, prices);
              const title = mode === "plan" ? "Scheduled order" : "One-time order";
              const groupCount = cartCount(cart);
              return <section key={mode} className={styles.group} aria-label={title}>
                <header className={styles.groupHeading}>
                  <h3>{title}</h3>
                  <span>{groupCount} {groupCount === 1 ? "product" : "products"}</span>
                </header>
                <ul className={styles.items}>
                  {(["milk", "paneer", "ghee"] as const).map((id) => {
                    const item = cart[id];
                    if (!item) return null;
                    const p = shopProduct(id, prices);
                    const repeat = routines.find((r) => r.id === id)?.repeat;
                    const variable =
                      id === "milk" &&
                      mode === "plan" &&
                      cart.milk &&
                      repeat === "days" &&
                      new Set(cart.milk.schedule.filter((q) => q > 0)).size > 1;
                    return (
                      <li key={id}>
                        <label className={styles.selectItem}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.name} for checkout`}
                            checked={cart.selected[id]}
                            onChange={(event) => changeCart(mode, {
                              ...cart,
                              selected: { ...cart.selected, [id]: event.target.checked },
                            })}
                          />
                          <Image src={p.image} alt="" width={54} height={54} />
                          <span className={styles.itemBody}>
                            <strong>{p.name}</strong>
                            <small>
                              {mode === "plan"
                                ? `${id === "milk" ? "Litres" : "500 g"} · ${repeat === "custom" ? "Your selected dates" : repeat === "days" ? "Selected weekdays" : (repeat ?? "Scheduled")}`
                                : id === "milk"
                                  ? "Litres"
                                  : "500 g · One delivery"}
                            </small>
                          </span>
                          <span className={styles.linePrice}>
                            {money(
                              id === "milk"
                                ? quote.milkTotal
                                : (quote.productTotals[id] ?? 0),
                            )}
                          </span>
                        </label>
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
                                onClick={() => quantity(mode, id, item.quantity - 1)}
                              >
                                −
                              </button>
                              <output>{item.quantity}</output>
                              <button
                                type="button"
                                disabled={item.quantity >= 5}
                                aria-label={`Increase cart ${id} quantity`}
                                onClick={() => quantity(mode, id, item.quantity + 1)}
                              >
                                +
                              </button>
                            </div>
                          )}
                          <div className={styles.itemLinks}>
                            <Link className={styles.edit} href={`/shop/${id}`} aria-label={`Edit ${p.name}`} onClick={() => browseMode(mode)}>
                              Edit
                            </Link>
                            <button type="button" className={styles.remove} aria-label={`Remove ${p.name}`}
                              onClick={() => changeCart(mode, { ...cart, [id]: null, selected: { ...cart.selected, [id]: false } })}>
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
                        : changeCart(mode, { ...cart, start: e.target.value })
                    }
                  />
                </label>
                {mode === "plan" ? (
                  <details className={styles.calendar}>
                    <summary>View your shared calendar</summary>
                    <SharedCalendar start={cart.start} rules={routines} />
                  </details>
                ) : null}
              </section>;
            })}
            {suggestionMode && suggestionCart?.milk && (!suggestionCart.paneer || !suggestionCart.ghee) ? (
              <section
                className={styles.suggestions}
                aria-labelledby="cart-suggestions"
              >
                <h3 id="cart-suggestions">Complete your basket.</h3>
                <p>Something for the kitchen, too?</p>
                {(["paneer", "ghee"] as const)
                  .filter((id) => !suggestionCart[id])
                  .map((id) => {
                    const p = shopProduct(id, prices);
                    return (
                      <Link
                        key={id}
                        href={`/shop/${id}`}
                        onClick={() => browseMode(suggestionMode)}
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
          </>
        )}
        {count > 0 && (
          <section className={styles.bottom} aria-label="Selected order estimate">
            {checkoutReady && scheduledQuote ? (
              <>
                <div><span>One-time order</span><strong>{money(selectedQuote.total)}</strong></div>
                <div><span>Scheduled order</span><strong>{money(scheduledQuote.total)}</strong></div>
              </>
            ) : checkoutReady ? (
              <>
                <div><span>{checkoutMode === "plan" ? "Selected plan products" : "Selected products subtotal"}</span><strong>{money(productSubtotal)}</strong></div>
                {selectedQuote.deliveryCharge > 0 && <div><span>Delivery</span><strong>{money(selectedQuote.deliveryCharge)}</strong></div>}
                {selectedQuote.handlingCharge > 0 && <div><span>Handling</span><strong>{money(selectedQuote.handlingCharge)}</strong></div>}
                {selectedQuote.platformCharge > 0 && <div><span>Platform fee</span><strong>{money(selectedQuote.platformCharge)}</strong></div>}
              </>
            ) : null}
            {checkoutReady && <div className={styles.total} aria-live="polite"><span>Estimated total</span><strong>{money(selectedQuote.total + (scheduledQuote?.total ?? 0))}</strong></div>}
            <p>{checkoutNote}</p>
            {checkoutReady ? (
              <Link
                className={styles.checkout}
                href={checkoutHref}
                prefetch={false}
                onClick={() => setCartOpen(false)}
              >
                Continue to delivery details <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <button className={styles.checkout} type="button" disabled>
                Continue to delivery details
              </button>
            )}
            <p className={styles.saved}>
              Tap a product to deselect it. Unselected items stay in your cart.
            </p>
          </section>
        )}
      </dialog>
    </>
  );
}
