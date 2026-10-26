import { FormSubmitButton } from "@/app/farm/form-submit-button";
import { cancelPlan } from "./actions";
import styles from "./account.module.css";

export function PlanCancellationForm({
  planId,
  label,
}: {
  planId: string;
  label: string;
}) {
  return (
    <details className={styles.cancelRequest}>
      <summary>{label}</summary>
      <p>
        Cancellation takes effect immediately, without farm approval.
        Unfulfilled scheduled visits stop. Completed deliveries and paid history
        stay recorded; no automatic refund is issued.
      </p>
      <form action={cancelPlan}>
        <input name="planId" type="hidden" value={planId} />
        <label>
          Reason (optional)
          <textarea
            className={styles.reasonField}
            name="reason"
            maxLength={500}
            rows={3}
          />
        </label>
        <FormSubmitButton pendingLabel="Cancelling…">
          Cancel plan now
        </FormSubmitButton>
      </form>
    </details>
  );
}
