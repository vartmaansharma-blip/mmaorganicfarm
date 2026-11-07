"use client";

import { useActionState } from "react";
import { FarmForm } from "../farm-form";
import { reviewTodayRequest } from "./today-request-actions";
import styles from "../operations-workbench.module.css";

export function TodayRequestReview({ id, canApply, followingUp }: { id: string; canApply: boolean; followingUp: boolean }) {
  const [state, action, pending] = useActionState(reviewTodayRequest, null);
  return <FarmForm action={action} managed feedback={state} className={styles.actionForm}>
    <input type="hidden" name="requestId" value={id} />
    <fieldset disabled={pending || state?.ok}>
      <legend>Review request</legend>
      <label>Decision<select name="decision" required defaultValue="">
        <option value="" disabled>Choose a decision</option>
        {followingUp ? <option value="resolved">Close after customer follow-up</option> : <>
          {canApply ? <option value="applied">Move prepaid quantity to tomorrow</option> : null}
          <option value="follow_up">Contact customer to follow up</option>
          <option value="declined">Decline and keep current delivery</option>
        </>}
      </select></label>
      <label>Message to customer<textarea name="note" rows={2} minLength={3} maxLength={300} required /></label>
      <button type="submit">{pending ? "Saving…" : "Save decision"}</button>
    </fieldset>
    {state ? <p role={state.ok ? "status" : "alert"}>{state.message ?? state.error}</p> : null}
  </FarmForm>;
}
