import type { ClassConstructor } from "class-transformer";

export interface IEntityResolverService {
  get<T, C>(entity: ClassConstructor<T>, data: Record<string, unknown>, options?: ResolverGetOptions<C>): void;
}

export interface ResolverGetOptions<C> {
  context?: C;
}

export interface ClassTransformerSubType {
  name: string;
  value: ClassConstructor<unknown>;
}
