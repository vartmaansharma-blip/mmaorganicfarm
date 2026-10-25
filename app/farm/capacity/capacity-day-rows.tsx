"use client";
import { useState } from "react";
import { formatCalendarDate } from "@/lib/delivery-calendar";
import { FarmForm } from "../farm-form";
import { FormSubmitButton } from "../form-submit-button";
import { removeCapacityOverride, saveCapacityOverride } from "./actions";
import styles from "./capacity.module.css";
export type CapacityDay = { active_plan_quantity: number | string; available_quantity: number | string; capacity_limit: number | string; checkout_holds_quantity: number | string; delivery_date: string; paid_once_quantity: number | string };
const quantity = (value: number | string) => Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-IN",{maximumFractionDigits:2}) : "—";
export function CapacityDayRows({ day, productKey, unit, step, override, canManage }: { day: CapacityDay; productKey: string; unit: string; step: string; override: boolean; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const paid = Number(day.active_plan_quantity) + Number(day.paid_once_quantity);
  const available = Number(day.available_quantity);
  const shortage = available < 0;
  const utilisation = Math.max(0, Math.min(100, ((paid + Number(day.checkout_holds_quantity)) / Math.max(1, Number(day.capacity_limit))) * 100));
  const label = formatCalendarDate(day.delivery_date);
  return <>
    <tr data-shortfall={shortage || undefined}>
      <th scope="row"><strong>{label}</strong><small>{override ? "One-day limit" : "Normal limit"}</small></th>
      <td data-label="Daily limit">{quantity(day.capacity_limit)} <small>{unit}</small></td>
      <td data-label="Paid commitments">{quantity(paid)} <small>{unit}</small></td>
      <td data-label="Checkout holds">{quantity(day.checkout_holds_quantity)} <small>{unit}</small></td>
      <td data-label={shortage ? "Shortfall" : "Available"} className={styles.availability}><strong>{quantity(Math.abs(available))} {unit}</strong><span>{shortage ? "Shortfall — review required" : "Available for new orders"}</span><div className={styles.meter} aria-hidden="true"><span style={{width:`${utilisation}%`}} /></div></td>
      <td className={styles.rowAction}>{canManage ? <button type="button" className={styles.editButton} aria-label={`Edit capacity for ${label}`} aria-expanded={editing} onClick={() => setEditing(value => !value)}>{editing ? "Done" : "Edit"}</button> : null}</td>
    </tr>
    {editing ? <tr className={styles.editorRow}><td colSpan={6}>
      <div className={styles.rowEditor}>
        <div><strong>{label} · {productKey === "milk" ? "Fresh milk" : productKey === "paneer" ? "Fresh paneer" : "Farm ghee"}</strong><p>Change this date only. Existing paid service stays recorded.</p></div>
        <FarmForm action={saveCapacityOverride} className={styles.inlineForm}>
          <input name="productKey" type="hidden" value={productKey} /><input name="deliveryDate" type="hidden" value={day.delivery_date} />
          <label>Capacity ({unit})<input key={`${day.delivery_date}-${day.capacity_limit}`} aria-label={`Capacity for ${label}`} name="dailyLimit" type="number" min="0" step={step} required defaultValue={day.capacity_limit} /></label>
          <FormSubmitButton pendingLabel="Saving…">Save day limit</FormSubmitButton>
        </FarmForm>
        <FarmForm action={removeCapacityOverride}><input name="productKey" type="hidden" value={productKey} /><input name="deliveryDate" type="hidden" value={day.delivery_date} /><span hidden={!override}><FormSubmitButton pendingLabel="Restoring…" className={styles.quietButton}>Use normal limit</FormSubmitButton></span></FarmForm>
      </div>
    </td></tr> : null}
  </>;
}
