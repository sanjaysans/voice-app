"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();
let inFlightRequestCount = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

export function beginApiRequest() {
  inFlightRequestCount += 1;
  emit();
}

export function endApiRequest() {
  inFlightRequestCount = Math.max(0, inFlightRequestCount - 1);
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return inFlightRequestCount;
}

export function useApiActivity() {
  const requestCount = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  return {
    requestCount,
    isLoading: requestCount > 0
  };
}
