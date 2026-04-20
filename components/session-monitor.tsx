"use client";

import { useSessionTimeout } from '@/hooks/use-session-timeout';

export function SessionMonitor() {
  useSessionTimeout();
  return null;
}
