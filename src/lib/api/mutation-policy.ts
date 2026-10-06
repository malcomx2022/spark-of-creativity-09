/** Offline writes fail immediately; never pause/replay a booking or payment on reconnect. */
export const onlineMutationOptions = { networkMode: 'always' as const, retry: false };
