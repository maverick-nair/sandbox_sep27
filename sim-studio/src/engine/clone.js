// Deep copy for definitions. structuredClone needs Safari 15.4 or newer; definitions are plain
// JSON, so a JSON round trip is an exact fallback.
export const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
