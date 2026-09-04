import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { getMe, updateMe } from "@workspace/api-client-react";

import {
  clearPendingUsername,
  getPendingUsername,
} from "@/lib/pendingUsername";

export function PendingUsernameLink() {
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      attempted.current = false;
      return;
    }
    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const pending = await getPendingUsername();
        if (!pending) return;
        if (!userId || pending.clerkUserId !== userId) {
          await clearPendingUsername();
          return;
        }
        const { username } = pending;
        const me = await getMe();
        if (me.username && me.username !== username) {
          await clearPendingUsername();
          return;
        }
        if (!me.username) await updateMe({ username });
        await clearPendingUsername();
        await queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === "string" &&
            query.queryKey[0].startsWith("/api/me"),
        });
      } catch {
        // Retain the short-lived stash so startup can retry. Profile remains
        // available if the username was taken between availability and save.
      }
    })();
  }, [isSignedIn, queryClient, userId]);

  return null;
}