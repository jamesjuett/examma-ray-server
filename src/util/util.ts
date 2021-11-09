import * as dotenv from 'dotenv';
import fs from 'fs';

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function asMutable<T>(obj: T) : Mutable<T> {
    return <Mutable<T>>obj;
}

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

export function assertExists<T>(obj: T | undefined) : T {
  if (obj === undefined) {
    throw new Error();
  }
  return obj;
}

let config_loaded = false;
export function dotenv_config() {
  if (!config_loaded) {
    dotenv.config();
    config_loaded = true;
  }
}

export function getDockerSecret(name: string) {
  try {
    return fs.readFileSync(`/run/secrets/${name}`, "utf8");
  }
  catch (e) {
    throw new Error(`Unable to find docker secret "${name}"`);
  }
}