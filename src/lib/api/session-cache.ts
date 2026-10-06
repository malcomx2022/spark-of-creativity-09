import type { QueryClient } from '@tanstack/react-query';
import { getSession, onAuthStateChange } from './session';

/** Install once, before mounting React, so old account data never reaches a new render. */
export function isolateSessionCache(client: QueryClient): () => void {
  let owner = getSession()?.user.id ?? null;
  return onAuthStateChange((_event, session) => {
    const nextOwner = session?.user.id ?? null;
    if (owner !== nextOwner) {
      // clear() cancels active queries as well as removing their results and mutations.
      client.clear();
      owner = nextOwner;
    }
    client.setQueryData(['auth', 'user'], session?.user ?? null);
  });
}
