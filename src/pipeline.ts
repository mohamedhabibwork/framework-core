import type { Pipe } from './types';

/**
 * In-process composition: send a payload through an ordered list of pipes
 * before a terminal destination. Each pipe receives the payload and a `next`
 * continuation; returning without calling `next` short-circuits the chain.
 * Pipes run in the current process — durable pipelines live in
 * `@framework/workflow`.
 */
export class Pipeline<P> {
  readonly #input: P;
  readonly #pipes: readonly Pipe<P>[];

  private constructor(input: P, pipes: readonly Pipe<P>[]) {
    this.#input = input;
    this.#pipes = pipes;
  }

  static send<P>(input: P): Pipeline<P> {
    return new Pipeline(input, []);
  }

  /** Appends pipes to the chain (order matters; the first pipe runs first). */
  through(...pipes: readonly Pipe<P>[]): Pipeline<P> {
    return new Pipeline(this.#input, [...this.#pipes, ...pipes]);
  }

  /** Runs the chain; the destination receives the payload after the last pipe. */
  // oxlint-disable-next-line unicorn/no-thenable -- Laravel-style pipeline API, not a thenable
  then<D>(destination: (payload: P) => D | Promise<D>): Promise<D> {
    let forward: (payload: P) => Promise<P> = async (payload) => payload;
    for (let i = this.#pipes.length - 1; i >= 0; i -= 1) {
      const pipe = this.#pipes[i] as Pipe<P>;
      const downstream = forward;
      const invoke =
        typeof pipe === 'function'
          ? (payload: P) => pipe(payload, downstream)
          : (payload: P) => pipe.handle(payload, downstream);
      forward = async (payload) => await invoke(payload);
    }
    return Promise.resolve(forward(this.#input)).then((payload) => destination(payload));
  }
}

/** Entry point: `pipeline(input).through(a, b).then(save)`. */
export function pipeline<P>(input: P): Pipeline<P> {
  return Pipeline.send(input);
}
