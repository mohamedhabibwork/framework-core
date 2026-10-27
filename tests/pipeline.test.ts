import { describe, expect, test } from 'bun:test';
import { pipeline } from '../src';

describe('Pipeline (in-process)', () => {
  test('runs pipes in order before the destination', async () => {
    const order: string[] = [];
    const result = await pipeline({ value: 1 })
      .through(
        async (payload, next) => {
          order.push('a');
          return next({ ...payload, value: payload.value + 1 });
        },
        {
          handle: async (payload, next) => {
            order.push('b');
            return next({ ...payload, value: payload.value * 10 });
          },
        },
      )
      .then(async (payload) => {
        order.push('destination');
        return payload.value;
      });
    expect(result).toBe(20);
    expect(order).toEqual(['a', 'b', 'destination']);
  });

  test('a pipe may short-circuit without calling next', async () => {
    const result = await pipeline('input')
      .through(
        (payload, next) => next(`${payload}!`),
        () => 'short-circuited',
      )
      .then((payload) => payload.toUpperCase());
    expect(result).toBe('SHORT-CIRCUITED');
  });

  test('works with plain values (no pipes)', async () => {
    expect(await pipeline(21).then((value) => value * 2)).toBe(42);
  });
});
