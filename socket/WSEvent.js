function createEvents(...names) {
    return Object.freeze(
        names.reduce((acc, name) => {
            acc[name] = name.toLowerCase();
            return acc;
        }, {})
    );
}

const SOCKET_EVENT = createEvents(
    "SEND",
    "WRITING_START",
    "WRITING_STOP",
    "RECEIVE",
    "BLOCK",
    "UNBLOCK",
    "BAN",
    "FAILED_AUTH",
    "FRIENDSHIP_INVITE",
    "ACCEPT_INVITE",
    "REJECT_INVITE",
    "UNFRIEND"
);

module.exports = { SOCKET_EVENT };
