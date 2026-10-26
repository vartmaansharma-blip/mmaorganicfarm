"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FARM_PRODUCTS, type FarmProductSelection } from "@/lib/farm-products";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import {
  calculateOrderPricing,
  calculatePlanPricing,
} from "@/lib/order-pricing";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
import {
  milkDeliveryDates,
  validShopDate,
  type ShopDraft,
  type ShopProductId,
} from "@/lib/shop-draft";
import { addCartProduct } from "@/lib/shop-cart";
import { shopProduct } from "@/lib/shop-products";
import { useShop } from "./shop-state";
import styles from "./shop.module.css";
import { ScheduledProductDetails } from "./scheduled-product-details";
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
function Stepper({
  value,
  onChange,
  min = 1,
  max = 5,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
export function ProductDetails({ id }: { id: ShopProductId }) {
  const { state } = useShop();
  return state.mode === "plan" ? (
    <ScheduledProductDetails key={id} id={id} />
  ) : (
    <OneTimeProductDetails key={id} id={id} />
  );
}
function OneTimeProductDetails({ id }: { id: ShopProductId }) {
  const { state, update, firstPlanStart, setCartOpen, prices } = useShop(),
    p = shopProduct(id, prices),
    mode = state.mode,
    d = state.drafts[mode][id],
    plan = mode === "plan",
    milk = id === "milk";
  const [custom, setCustom] = useState(false);
  const minimum = nextDeliveryDateInIndia();
  function change(next: ShopDraft) {
    next = {
      ...next,
      extras: {
        paneer: {
          ...next.extras.paneer,
          days: next.extras.paneer.days.filter(
            (day) => next.schedule[day - 1] > 0,
          ),
        },
        ghee: {
          ...next.extras.ghee,
          days: next.extras.ghee.days.filter(
            (day) => next.schedule[day - 1] > 0,
          ),
        },
      },
    };
    update({
      ...state,
      drafts: {
        ...state.drafts,
        [mode]: { ...state.drafts[mode], [id]: next },
      },
    });
  }
  const extras: FarmProductSelection[] = milk
    ? FARM_PRODUCTS.map(p => ({...p, price: prices[p.id]})).flatMap((product) => {
        const x = d.extras[product.id];
        return x.enabled
          ? [
              {
                ...product,
                ...x,
                days: plan ? x.days : [],
                frequency: plan ? x.frequency : "once",
              } as FarmProductSelection,
            ]
          : [];
      })
    : [
        {
          ...FARM_PRODUCTS.find((product) => product.id === id)!,
          quantity: d.quantity,
          days: [],
          frequency: "once",
        },
      ];
  const dates = plan && milk ? milkDeliveryDates(d.schedule, d.start) : [];
  const validDate = validShopDate(d.start) && d.start >= minimum;
  const pricing =
    plan && milk
      ? calculatePlanPricing({ prices,
          bottleChoice: "return",
          products: extras,
          schedule: d.schedule,
          startDate: validDate ? (dates[0]?.date ?? d.start) : "",
          firstPlanStart: firstPlanStart ?? dates[0]?.date ?? d.start,
        })
      : calculateOrderPricing({ prices,
          bottleChoice: milk ? "return" : "none",
          milkLitres: milk ? d.quantity : 0,
          products: extras,
        });
  const ready =
    validDate &&
    (!plan || !milk || dates.length === 30) &&
    !extras.some((x) => x.frequency === "weekly" && !x.days.length);
  const selected = d.schedule.map((q) => q > 0),
    pattern = selected.every(Boolean)
      ? "daily"
      : selected.every((v, i) => v === i < 5)
        ? "weekdays"
        : "custom";
  function addToCart() {
    const cart = addCartProduct(state.carts[mode], id, d, mode);
    const milkDraft = state.drafts[mode].milk;
    update({
      ...state,
      carts: { ...state.carts, [mode]: cart },
      drafts: {
        ...state.drafts,
        [mode]: {
          ...state.drafts[mode],
          milk: {
            ...milkDraft,
            extras: {
              paneer: cart.paneer ?? milkDraft.extras.paneer,
              ghee: cart.ghee ?? milkDraft.extras.ghee,
            },
          },
        },
      },
    });
    setCartOpen(true);
  }
  return (
    <main className={styles.productPage}>
      <Link className={styles.back} href="/shop">
        ← Back to the counter
      </Link>
      <div className={styles.detailGrid}>
        <div className={styles.detailPhoto}>
          <Image
            src={p.image}
            alt={p.alt}
            width={800}
            height={1000}
            sizes="(max-width: 700px) 90vw, 45vw"
            priority
          />
        </div>
        <div className={styles.detailCopy}>
          <p className={styles.eyebrow}>M’ma Organic Farm</p>
          <div className={styles.productTitle}>
            <h1>{p.name}</h1>
            <p>
              {money(p.price)} <span>/ {p.unit}</span>
            </p>
          </div>
          <p className={styles.description}>{p.description}</p>
          <section
            className={styles.configuration}
            aria-labelledby="choose-product"
          >
            <h2 id="choose-product">
              {milk ? "Your milk, your way." : "Make it yours."}
            </h2>
            <div className={styles.quantityRow}>
              <span>
                {milk
                  ? "Litres per delivery"
                  : id === "paneer"
                    ? "500 g packs"
                    : "500 g jars"}
              </span>
              <Stepper
                value={d.quantity}
                label={`${id} quantity`}
                onChange={(quantity) =>
                  change({
                    ...d,
                    quantity,
                    schedule: d.schedule.map((q) =>
                      q > 0 ? quantity : 0,
                    ) as WeeklyMilkSchedule,
                  })
                }
              />
            </div>
            {plan && !milk ? (
              <>
                <p className={styles.note}>
                  Add {p.name.toLowerCase()} to your milk plan’s first delivery.
                  Choose its quantity and days on the milk page. For a separate
                  delivery, switch to One-time.
                </p>
                <button
                  className={styles.primary}
                  type="button"
                  onClick={addToCart}
                >
                  {state.carts[mode][id] ? "Update cart" : "Add to cart"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <>
                <label className={styles.field}>
                  {" "}
                  {plan ? "From date" : "Delivery date"}
                  <input
                    type="date"
                    min={minimum}
                    required
                    value={d.start}
                    onChange={(e) => change({ ...d, start: e.target.value })}
                  />
                </label>
                {plan && milk ? (
                  <>
                    <p className={styles.fieldLabel}>How often?</p>
                    <div
                      className={styles.patterns}
                      role="group"
                      aria-label="Milk delivery pattern"
                    >
                      {(["daily", "weekdays", "custom"] as const).map(
                        (value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={
                              (custom || pattern === "custom"
                                ? "custom"
                                : pattern) === value
                            }
                            onClick={() => {
                              setCustom(value === "custom");
                              if (value !== "custom")
                                change({
                                  ...d,
                                  schedule: d.schedule.map((q, i) =>
                                    value === "daily" || i < 5
                                      ? q || d.quantity
                                      : 0,
                                  ) as WeeklyMilkSchedule,
                                });
                            }}
                          >
                            {value === "daily"
                              ? "Every day"
                              : value === "weekdays"
                                ? "Weekdays"
                                : "Choose days"}
                          </button>
                        ),
                      )}
                    </div>
                    <p className={styles.note}>
                      30 milk deliveries on the days you choose.
                    </p>
                    {custom || pattern === "custom" ? (
                      <div className={styles.customWeek}>
                        {MILK_PLAN_DAYS.map((day, i) => (
                          <div className={styles.quantityRow} key={day.short}>
                            <span>{day.label}</span>
                            <Stepper
                              min={0}
                              value={d.schedule[i]}
                              label={`${day.label} litres`}
                              onChange={(quantity) =>
                                change({
                                  ...d,
                                  schedule: d.schedule.map((q, n) =>
                                    n === i ? quantity : q,
                                  ) as WeeklyMilkSchedule,
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                {milk ? (
                  <details className={styles.optional}>
                    <summary>Add paneer or ghee</summary>
                    {FARM_PRODUCTS.map(p => ({...p, price: prices[p.id]})).map((product) => {
                      const x = d.extras[product.id];
                      function extra(value: Partial<typeof x>) {
                        change({
                          ...d,
                          extras: {
                            ...d.extras,
                            [product.id]: { ...x, ...value },
                          },
                        });
                      }
                      return (
                        <div className={styles.extra} key={product.id}>
                          <label className={styles.check}>
                            <input
                              type="checkbox"
                              checked={x.enabled}
                              onChange={(e) =>
                                extra({ enabled: e.target.checked })
                              }
                            />
                            <span>
                              {product.name} · {product.unit}
                            </span>
                            <small>{money(product.price)}</small>
                          </label>
                          {x.enabled ? (
                            <div className={styles.extraOptions}>
                              <Stepper
                                value={x.quantity}
                                label={`${product.id} packs`}
                                onChange={(quantity) => extra({ quantity })}
                              />
                              {plan ? (
                                <>
                                  <div className={styles.patterns}>
                                    <button
                                      type="button"
                                      aria-pressed={x.frequency === "once"}
                                      onClick={() =>
                                        extra({ frequency: "once" })
                                      }
                                    >
                                      First delivery
                                    </button>
                                    <button
                                      type="button"
                                      aria-pressed={x.frequency === "weekly"}
                                      onClick={() =>
                                        extra({ frequency: "weekly" })
                                      }
                                    >
                                      Weekly
                                    </button>
                                  </div>
                                  {x.frequency === "weekly" ? (
                                    <div
                                      className={styles.dayChoices}
                                      role="group"
                                      aria-label={`${product.name} delivery days`}
                                    >
                                      {MILK_PLAN_DAYS.map((day, i) => (
                                        <button
                                          key={day.short}
                                          type="button"
                                          disabled={d.schedule[i] === 0}
                                          aria-pressed={x.days.includes(i + 1)}
                                          onClick={() =>
                                            extra({
                                              days: x.days.includes(i + 1)
                                                ? x.days.filter(
                                                    (n) => n !== i + 1,
                                                  )
                                                : [...x.days, i + 1],
                                            })
                                          }
                                        >
                                          {day.short}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              ) : null}
                              <p className={styles.note}>
                                {plan && x.frequency === "weekly"
                                  ? "On selected milk delivery days."
                                  : "Added once, without repeats."}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </details>
                ) : null}
                {plan && milk ? (
                  <details className={styles.optional}>
                    <summary>See delivery dates</summary>
                    <ol className={styles.dateList}>
                      {dates.map((date) => (
                        <li key={date.date}>
                          <time dateTime={date.date}>
                            {new Intl.DateTimeFormat("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            }).format(new Date(`${date.date}T12:00:00Z`))}
                          </time>
                          <span>{date.quantity} L</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                <p className={styles.note}>
                  Scheduled orders have no delivery, platform, surge or
                  miscellaneous fees for one month from your first plan. After
                  that, delivery is ₹2 per delivery, free when its products
                  total above ₹199. One-time delivery is ₹5, free above ₹199.
                </p>
                <div className={styles.total}>
                  <span>Delivery</span>
                  <strong>
                    {pricing.deliveryCharge
                      ? money(pricing.deliveryCharge)
                      : "Free"}
                  </strong>
                </div>
                <div className={styles.total}>
                  <span>{plan ? "30-delivery plan" : "Order total"}</span>
                  <strong>{money(pricing.total)}</strong>
                </div>
                <p className={styles.note}>
                  Milk prices include bottle return. New bottles can be chosen
                  before payment. Delivery is subject to address and capacity
                  checks.
                </p>
                <button
                  className={styles.primary}
                  disabled={!ready}
                  type="button"
                  onClick={addToCart}
                >
                  {state.carts[mode][id] ? "Update cart" : "Add to cart"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
                {!ready ? (
                  <p className={styles.note} role="status">
                    Choose a valid date, milk delivery days and any add-on days
                    to continue.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>
      <nav className={styles.related} aria-label="More from M’ma">
        {(["milk", "paneer", "ghee"] as const)
          .filter((key) => key !== id)
          .map((key) => (
            <Link href={`/shop/${key}`} key={key}>
              {shopProduct(key).name} ↗
            </Link>
          ))}
      </nav>
    </main>
  );
}
