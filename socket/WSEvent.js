function createEvents(...names) {
  return Object.freeze(
    names.reduce((acc, name) => {
      acc[name] = name;
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
  "BAN"
);

module.exports = { SOCKET_EVENT };