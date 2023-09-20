import type { ClassConstructor } from "class-transformer";

export interface IEntityResolverService {
  get<T, C = undefined>(target: ClassConstructor<T>, data: object, options?: ResolverGetOptions<C>): Promise<T>;
}

export interface ResolverGetOptions<C> {
  context?: C;
  // outputs raw data without transforming it with class-transformer
  raw: boolean;
}

export interface ClassTransformerSubType {
  name: string;
  value: ClassConstructor<unknown>;
}
