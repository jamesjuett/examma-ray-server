

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function asMutable<K,V>(map: ReadonlyMap<K, V>) : Map<K, V>;
export function asMutable<T>(obj: T) : Mutable<T>;
export function asMutable<T>(obj: T) : T {
    return obj;
}

export type Exact<A, B> = A extends B
  ? B extends A ? A : never
  : never;

export function assert(condition: any, message: string = "") : asserts condition {
  if (!condition) {
    throw Error("Assert failed: " + message);
  }
};

export function assertFalse(message: string = "") : never {
    throw Error("Assert failed: " + message);
};

// https://www.typescriptlang.org/docs/handbook/advanced-types.html#exhaustiveness-checking
export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function assertExists<T>(obj: T | undefined, message: string = "") : T {
  if (obj === undefined) {
    throw new Error("Assert failed: " + message);
  }
  return obj;
}