

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function asMutable<K,V>(map: ReadonlyMap<K, V>) : Map<K, V>;
export function asMutable<T>(obj: T) : Mutable<T>;
export function asMutable<T>(obj: T) : T {
    return obj;
}

export type Exact<A, B extends A> = [A] extends [B] ? A : never; // [] are used to prevent distribution

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

// An absent duration means the exam has no time limit, so it never expires.
export function isDurationExpired(
  duration_seconds: number | null | undefined,
  duration_multiplier: number,
  start_time: Date | string | null | undefined,
  now_ms: number,
  grace_period_ms: number = 0
) : boolean {
  if (duration_seconds === undefined || duration_seconds === null || !start_time) {
    return false;
  }
  const duration_ms = duration_seconds * duration_multiplier * 1000;
  return new Date(start_time).getTime() + duration_ms < now_ms - grace_period_ms;
}

// grace_period_ms extends how long after close_time the window is still considered open.
export function isWithinWindow(
  open_time: Date | string,
  close_time: Date | string,
  now_ms: number,
  grace_period_ms: number = 0
) : boolean {
  return now_ms >= new Date(open_time).getTime() && now_ms < new Date(close_time).getTime() + grace_period_ms;
}

// An absent deadline means there is no deadline, so it can never be past.
export function isPastDeadline(
  deadline: Date | string | null | undefined,
  now_ms: number
) : boolean {
  if (deadline === undefined || deadline === null) {
    return false;
  }
  return new Date(deadline).getTime() < now_ms;
}

type SimpleJSONComponent =
  | string | number | boolean
  | SimpleJSONComponent[]
  | { [key: string]: SimpleJSONComponent };

export type SimpleJSON = {
  [key: string]: SimpleJSONComponent
};