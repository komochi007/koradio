export interface BoundedTtlCacheOptions {
  capacity: number;
  defaultTtlMs: number;
  now?: () => number;
}

interface CacheEntry<Value> {
  expiresAt: number;
  value: Value;
}

export class BoundedTtlCache<Key, Value> {
  readonly #capacity: number;
  readonly #defaultTtlMs: number;
  readonly #entries = new Map<Key, CacheEntry<Value>>();
  readonly #now: () => number;

  constructor(options: BoundedTtlCacheOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1 || options.defaultTtlMs < 1) {
      throw new TypeError("Cache limits are invalid");
    }

    this.#capacity = options.capacity;
    this.#defaultTtlMs = options.defaultTtlMs;
    this.#now = options.now ?? Date.now;
  }

  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }

    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value, ttlMs = this.#defaultTtlMs): void {
    if (ttlMs < 1) {
      return;
    }

    this.#entries.delete(key);
    this.#entries.set(key, {
      expiresAt: this.#now() + ttlMs,
      value,
    });
    this.prune();
  }

  prune(): void {
    const now = this.#now();
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(key);
      }
    }

    while (this.#entries.size > this.#capacity) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.#entries.delete(oldestKey);
    }
  }

  get size(): number {
    this.prune();
    return this.#entries.size;
  }
}
