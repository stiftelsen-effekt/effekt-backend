// Compile-time guards for the backend type bridge; checked by `npm run typecheck`.
import type { RouterOutputs } from "./trpc";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

type Owners = RouterOutputs["meta"]["owners"];

export type OwnersIsNotAny = Expect<IsAny<Owners> extends false ? true : false>;
export type OwnersShape = Expect<Equal<Owners, { id: number; name: string; default: boolean }[]>>;
