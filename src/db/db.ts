import assert from 'assert';
import knex from 'knex';
import knexfile from '../knexfile';

const env = process.env.NODE_ENV;
assert(env === "development" || env === "testing" || env === "production");


export const query = knex(knexfile[env]);

export function firstResult<T>(results: readonly T[]) : T | undefined {
    return results[0];
}

export function pick<T extends {}, K extends keyof T>(obj: T, props: K[]) : Pick<T, K> {
    let result : Pick<T, K> = <any>{};
    props.forEach(k => k && (result[k] = obj[k]));
    return result;
}