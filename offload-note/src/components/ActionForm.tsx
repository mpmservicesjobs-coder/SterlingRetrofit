"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";

type Props = {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
};

/** A form bound to a server action, with the result shown underneath. */
export default function ActionForm({ action, children, className, confirmText }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}>
        {children}
      </fieldset>
      {state?.ok ? <p className="smallprint" role="status">{state.ok}</p> : null}
      {state?.error ? <p className="err" role="alert">{state.error}</p> : null}
    </form>
  );
}
