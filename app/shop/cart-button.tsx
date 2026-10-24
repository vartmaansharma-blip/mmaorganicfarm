"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { OutlineIcon } from "@/app/components/outline-icon";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import {
  cartCount,
  cartOrderHref,
  cartQuote,
  cartReady,
} from "@/lib/shop-cart";
import { shopProduct } from "@/lib/shop-products";
import { type ShopProductId } from "@/lib/shop-draft";
import { useShop } from "./shop-state";
import styles from "./cart.module.css";
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
export function CartButton() {
  const { state, update, cartOpen, setCartOpen } = useShop();
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const mode = state.mode,
    cart = state.carts[mode],
    count = cartCount(cart),
    quote = cartQuote(cart, mode),
    minimum = nextDeliveryDateInIndia();
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
    const milk = next.milk ?? state.drafts[mode].milk;
    update({
      ...state,
      carts: { ...state.carts, [mode]: next },
      drafts: {
        ...state.drafts,
        [mode]: {
          milk: {
            ...milk,
            start: next.start,
            extras: {
              paneer: next.paneer ?? { ...milk.extras.paneer, enabled: false },
              ghee: next.ghee ?? { ...milk.extras.ghee, enabled: false },
            },
          },
          paneer: {
            ...state.drafts[mode].paneer,
            start: next.start,
            quantity:
              next.paneer?.quantity ?? state.drafts[mode].paneer.quantity,
          },
          ghee: {
            ...state.drafts[mode].ghee,
            start: next.start,
            quantity: next.ghee?.quantity ?? state.drafts[mode].ghee.quantity,
          },
        },
      },
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
  const productSubtotal = quote.total - quote.deliveryCharge;
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
                const p = shopProduct(id);
                const variable =
                  id === "milk" &&
                  mode === "plan" &&
                  cart.milk &&
                  new Set(cart.milk.schedule.filter((q) => q > 0)).size > 1;
                return (
                  <li key={id}>
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
                        {id === "milk"
                          ? mode === "plan"
                            ? "30 milk deliveries"
                            : "Litres"
                          : `500 g · ${mode === "plan" ? (cart[id]?.frequency === "weekly" ? "Weekly" : "First delivery") : "One delivery"}`}
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
              {mode === "plan" ? "Start date" : "Delivery date"}
              <input
                type="date"
                min={minimum}
                value={cart.start}
                onChange={(e) => changeCart({ ...cart, start: e.target.value })}
              />
            </label>
            {mode === "plan" && !cart.milk ? (
              <p className={styles.notice}>
                Scheduled paneer and ghee travel with a milk plan.{" "}
                <Link href="/shop/milk" onClick={() => setCartOpen(false)}>
                  Choose your milk routine →
                </Link>
              </p>
            ) : null}
            {mode === "plan" && cart.milk ? (
              <Link
                className={styles.edit}
                href="/shop/milk"
                onClick={() => setCartOpen(false)}
              >
                Edit delivery days and add-ons →
              </Link>
            ) : null}
            <div className={styles.bottom}>
              <div>
                <span>
                  {mode === "plan" ? "Plan products" : "Products subtotal"}
                </span>
                <strong>{money(productSubtotal)}</strong>
              </div>
              <p>
                {mode === "plan"
                  ? "First month: no delivery, platform, surge or miscellaneous fees. After that, ₹2 per delivery, free above ₹199 in products per delivery."
                  : "Delivery ₹5, free above ₹199 in products."}{" "}
                Your eligibility and full total are confirmed before payment.
              </p>
              {cartReady(cart, mode, minimum) ? (
                <Link
                  className={styles.checkout}
                  href={cartOrderHref(cart, mode)}
                  onClick={() => setCartOpen(false)}
                >
                  Continue to delivery details <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <button className={styles.checkout} type="button" disabled>
                  Complete your schedule
                </button>
              )}
              <p className={styles.saved}>
                Your cart is saved in this browser tab. Nothing is charged yet.
              </p>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
