"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

export type ToastActionState = { error?: string; success?: boolean } | undefined;

// Wraps useActionState with a toast on the transition from pending -> done,
// so every create/update form gets consistent success/error feedback
// without repeating the same effect in each form component.
export function useToastAction(
  action: (state: ToastActionState, formData: FormData) => Promise<ToastActionState>,
  successMessage: string,
) {
  const [state, formAction, pending] = useActionState<ToastActionState, FormData>(action, undefined);
  const wasPending = useRef(pending);

  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state?.error) toast.error(state.error);
      else if (state?.success) toast.success(successMessage);
    }
    wasPending.current = pending;
  }, [pending, state, successMessage]);

  return [state, formAction, pending] as const;
}
