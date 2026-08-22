"use client";

import { useCallback, useState } from "react";

export function useAsyncAction() {
  const [isPending, setIsPending] = useState(false);

  const run = useCallback(async (action: () => Promise<void> | void) => {
    if (isPending) {
      return;
    }

    setIsPending(true);
    try {
      await action();
    } finally {
      setIsPending(false);
    }
  }, [isPending]);

  return { isPending, run };
}

export function useKeyedAsyncAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(async (key: string, action: () => Promise<void> | void) => {
    if (pendingKey === key) {
      return;
    }

    setPendingKey(key);
    try {
      await action();
    } finally {
      setPendingKey((current) => (current === key ? null : current));
    }
  }, [pendingKey]);

  return {
    pendingKey,
    isPending: pendingKey !== null,
    run
  };
}
