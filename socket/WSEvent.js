const createEvents = (...names) =>
    Object.freeze(
        Object.fromEntries(names.map(n => [n, n.toLowerCase()]))
);

export const SOCKET_EVENT = createEvents(
    "SEND",
    "WRITING_START",
    "WRITING_STOP",
    "RECEIVE",
    "BLOCK",
    "UNBLOCK",
    "BAN",
);
