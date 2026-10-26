"use client";
import { useState } from "react";
import { FarmForm } from "../farm-form";
import { FormSubmitButton } from "../form-submit-button";
import { movePrepaidQuantity } from "./quantity-actions";
import { addCalendarDays } from "@/lib/delivery-calendar";
import styles from "../operations-workbench.module.css";
export type EditablePlanDay = {
  date: string;
  milk: number;
  paneer: number;
  ghee: number;
};
export function PrepaidQuantityForm({
  planId,
  userId,
  monthly,
  days,
}: {
  planId: string;
  userId: string;
  monthly: boolean;
  days: EditablePlanDay[];
}) {
  const [product, setProduct] = useState<"milk" | "paneer" | "ghee">("milk");
  const [source, setSource] = useState(
    days.find((d) => d.milk > 0)?.date ?? days[0]?.date ?? "",
  );
  const [target, setTarget] = useState(
    days.find((d) => d.date !== source)?.date ?? "",
  );
  const [skip, setSkip] = useState(false);
  const sourceQuantity = days.find((d) => d.date === source)?.[product] ?? 0;
  const effectiveTarget = monthly ? target : addCalendarDays(source, 1);
  const targetQuantity =
    days.find((d) => d.date === effectiveTarget)?.[product] ?? 0;
  const max = Math.min(
    monthly ? sourceQuantity : Math.max(sourceQuantity - 1, 0),
    5 - targetQuantity,
  );
  if (!days.length)
    return (
      <p className={styles.hint}>
        No future editable dates remain in this plan.
      </p>
    );
  return (
    <FarmForm action={movePrepaidQuantity} className={styles.actionForm}>
      <input name="planId" value={planId} type="hidden" />
      <input name="userId" value={userId} type="hidden" />
      <input name="sourceQuantity" value={sourceQuantity} type="hidden" />
      <input
        name="targetQuantity"
        value={skip && !monthly ? 0 : targetQuantity}
        type="hidden"
      />
      <input
        name="target"
        value={skip && !monthly ? "" : effectiveTarget}
        type="hidden"
      />
      <fieldset>
        <legend>
          {monthly ? "Move prepaid products" : "Adjust prepaid milk"}
        </legend>
        {monthly ? (
          <label>
            Product
            <select
              aria-label="Product to move"
            name="product"
              value={product}
              onChange={(e) => {
                const p = e.target.value as typeof product;
                setProduct(p);
                setSource(days.find((d) => d[p] > 0)?.date ?? days[0].date);
              }}
            >
              <option value="milk">Milk · litres</option>
              <option value="paneer">Paneer · 500 g packs</option>
              <option value="ghee">Ghee · 500 g jars</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="product" value="milk" />
        )}
        <label>
          From delivery
          <select
            aria-label="From delivery"
          name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {days
              .filter((d) => d[product] > 0)
              .map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date} · {d[product]} {product === "milk" ? "L" : "packs"}
                </option>
              ))}
          </select>
        </label>
        {monthly ? (
          <label>
            To delivery
            <select aria-label="To delivery" value={target} onChange={(e) => setTarget(e.target.value)}>
              {days
                .filter((d) => d.date !== source)
                .map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date} · {d[product]} already scheduled
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label>
            Change
            <select
              aria-label="Adjustment type"
            value={skip ? "skip" : "reduce"}
              onChange={(e) => setSkip(e.target.value === "skip")}
            >
              <option value="reduce">
                Reduce milk; carry the difference to tomorrow
              </option>
              <option value="skip">
                Skip the full delivery; retain it at plan end
              </option>
            </select>
          </label>
        )}
        {skip && !monthly ? (
          <input type="hidden" name="quantity" value={sourceQuantity} />
        ) : (
          <label>
            Quantity to move
            <input
              key={`${source}:${product}:${target}`}
              type="number"
              name="quantity"
              min="1"
              max={Math.max(max, 1)}
              step="1"
              required
              defaultValue="1"
            />
          </label>
        )}
        <p className={styles.hint}>
          {monthly
            ? "Move quantities within the paid month. Total purchased quantities and payment stay unchanged."
            : skip
              ? "A full skip stays at plan end, with no refund."
              : `Reduced milk goes to ${effectiveTarget}, the next calendar day. Only added milk requires a new paid order.`}
        </p>
        <label>
          Reason
          <textarea
            name="reason"
            minLength={3}
            maxLength={300}
            required
            rows={2}
          />
        </label>
        <FormSubmitButton
          disabled={
            !sourceQuantity ||
            (!(skip && !monthly) && (max < 1 || source === effectiveTarget))
          }
          pendingLabel="Updating schedule…"
        >
          Save quantity change
        </FormSubmitButton>
      </fieldset>
    </FarmForm>
  );
}
