"use client";

import { useEffect, useRef } from "react";
import type { CheckState } from "@/lib/selection";

export function RowCheck({
  state,
  onChange,
  label,
}: {
  state: CheckState;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "checked"}
      onChange={onChange}
      aria-label={label}
      className="size-4 cursor-pointer rounded accent-primary"
    />
  );
}
