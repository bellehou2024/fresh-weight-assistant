export function createLocalId(env = globalThis) {
  if (typeof env.crypto?.randomUUID === "function") {
    return env.crypto.randomUUID();
  }

  const now = typeof env.now === "function" ? env.now() : Date.now();
  const random = typeof env.random === "function" ? env.random() : Math.random();
  return `local-${now}-${Math.floor(random * 1_000_000_000).toString(36)}`;
}
