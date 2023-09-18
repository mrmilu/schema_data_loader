import type { ClassConstructor } from "class-transformer";

export interface IEntityResolverService {
  get<T, C>(target: ClassConstructor<T>, data: object, options?: ResolverGetOptions<C>): Promise<T>;
}

export interface ResolverGetOptions<C> {
  context?: C;
}

export interface ClassTransformerSubType {
  name: string;
  value: ClassConstructor<unknown>;
}
