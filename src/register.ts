/**
 * App-wide type registry. An application augments it once and every package
 * reads its types from here instead of taking a generic at each call site:
 *
 * ```ts
 * declare module '@framework/core' {
 *   interface Register {
 *     config: AppConfig;
 *   }
 * }
 * ```
 *
 * Unaugmented, every `Registered*` type falls back to the framework default,
 * so libraries and tests compile unchanged. Augmentation is global to a
 * TypeScript program — do it in the application, never inside a package.
 */
export interface Register {}

/** The application's config type, or `object` when `Register.config` is not augmented. */
export type RegisteredConfig = Register extends { readonly config: infer TConfig extends object } ? TConfig : object;

/** The application's user row, or `object` when `Register.user` is not augmented. */
export type RegisteredUser = Register extends { readonly user: infer TUser extends object } ? TUser : object;

/** `true` once an application has augmented `Register.config`. */
export type IsConfigRegistered = Register extends { readonly config: object } ? true : false;
