"use client";

import { useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

const SESSION_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT || '10800') * 1000; // 3 hours in ms

export function useSessionTimeout() {
  useEffect(() => {
    const supabase = getBrowserClient();
    let timeoutId: NodeJS.Timeout;

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const now = Date.now();
        const sessionAge = now - (expiresAt - SESSION_TIMEOUT);

        if (sessionAge >= SESSION_TIMEOUT) {
          await supabase.auth.signOut();
          window.location.href = '/ar/auth/login';
        } else {
          const remainingTime = SESSION_TIMEOUT - sessionAge;
          timeoutId = setTimeout(async () => {
            await supabase.auth.signOut();
            window.location.href = '/ar/auth/login';
          }, remainingTime);
        }
      }
    };

    checkSession();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
}
