export const ENTITY_KEY = Symbol("entity");

type ConditionalResolverSignature<C, M> = (context: C, meta: M, idx?: number) => boolean;

export interface EntityDecoratorOptions<C, M = object> {
  conditionalResolver: ConditionalResolverSignature<C, M>;
}

export function Entity<C, M = object>(options?: EntityDecoratorOptions<C, M>) {
  return function (target: object, propertyKey: string) {
    const entityMap: Map<string, EntityDecoratorOptions<C, M> | undefined> = Reflect.getMetadata(ENTITY_KEY, target.constructor) ?? new Map();
    if (!entityMap.has(propertyKey)) {
      entityMap.set(propertyKey, options);
      Reflect.defineMetadata(ENTITY_KEY, entityMap, target.constructor);
    }
  };
}
