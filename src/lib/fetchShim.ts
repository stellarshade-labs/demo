/**
 * Bind the global `fetch` to `globalThis`.
 *
 * The Shade SDK captures `globalThis.fetch` into an instance property and then
 * calls it as a method (`this.fetchFn(url)`). In Node that is harmless, but in
 * a browser `fetch` must be invoked with `window` as its receiver — calling it
 * through another object throws `TypeError: Illegal invocation`, and the SDK
 * surfaces that as a generic network error, so every relayer/indexer call fails
 * without ever hitting the network.
 *
 * The clients we construct ourselves could take an explicit `fetchFn`, but
 * `StealthClient` builds its own `HorizonClient` and `IndexerClient` internally
 * with no way to inject one. Re-binding the global covers every case at once.
 *
 * This module has a side effect on import and must be imported before any Shade
 * client is constructed.
 */
if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch.bind(globalThis);
}

export {};
