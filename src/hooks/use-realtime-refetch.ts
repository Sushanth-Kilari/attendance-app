"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Subscribes to Postgres change events on `table` and calls `onChange`
// (debounced) whenever a row changes. Used for views that Realtime can't
// subscribe to directly — postgres_changes only fires on base table
// writes, so the caller refetches the view instead of patching rows.
// `onChange` is kept in a ref so the effect doesn't need it in its
// dependency array — the caller doesn't have to memoize it.
export function useRealtimeRefetch(table: string, onChange: () => void, debounceMs = 800) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout>;

    const channel = supabase
      .channel(`realtime-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => onChangeRef.current(), debounceMs);
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [table, debounceMs]);
}
