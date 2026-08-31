"use client";

import { useCallback, useRef, useState } from "react";

export function useAsyncAction() {
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);

  const run = useCallback(async (action: () => Promise<void> | void) => {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setIsPending(true);
    try {
      await action();
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }, []);

  return { isPending, run };
}

export function useKeyedAsyncAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingKeyRef = useRef<string | null>(null);

  const run = useCallback(async (key: string, action: () => Promise<void> | void) => {
    if (pendingKeyRef.current === key) {
      return;
    }

    pendingKeyRef.current = key;
    setPendingKey(key);
    try {
      await action();
    } finally {
      pendingKeyRef.current = null;
      setPendingKey((current) => (current === key ? null : current));
    }
  }, []);

  return {
    pendingKey,
    isPending: pendingKey !== null,
    run
  };
}
