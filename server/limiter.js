'use strict';

// Small in-memory helpers with hard size caps, so a flood of distinct keys
// (spoofed IPs, random idempotency keys) can't grow memory without bound.

class TtlMap {
  constructor({ ttlMs, maxSize = 10_000 }) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.items = new Map();
  }

  get(key) {
    const hit = this.items.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.items.delete(key);
      return undefined;
    }
    return hit.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  set(key, value) {
    this.items.delete(key);
    if (this.items.size >= this.maxSize) this.items.delete(this.items.keys().next().value); // oldest first
    this.items.set(key, { value, at: Date.now() });
  }

  delete(key) {
    this.items.delete(key);
  }

  prune() {
    const now = Date.now();
    for (const [key, hit] of this.items) if (now - hit.at > this.ttlMs) this.items.delete(key);
  }
}

// Sliding-window counter per key.
class RateLimiter {
  constructor({ max, windowMs, maxKeys = 50_000 }) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  recent(key) {
    const now = Date.now();
    return (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
  }

  isLimited(key) {
    return this.recent(key).length >= this.max;
  }

  // Records a hit. Returns true when the key is over the limit (the hit is not recorded then).
  hit(key) {
    const list = this.recent(key);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return true;
    }
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune();
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value);
    list.push(Date.now());
    this.hits.set(key, list);
    return false;
  }

  reset(key) {
    this.hits.delete(key);
  }

  prune() {
    for (const key of this.hits.keys()) {
      const list = this.recent(key);
      if (list.length) this.hits.set(key, list);
      else this.hits.delete(key);
    }
  }
}

module.exports = { TtlMap, RateLimiter };
