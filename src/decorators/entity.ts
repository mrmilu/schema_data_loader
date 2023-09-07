export const ENTITY_KEY = Symbol("entity");

type ConditionalResolverSignature<C, M> = (context: C, meta: M) => boolean;

export interface EntityDecoratorOptions<C = object | Array<object>, M = object> {
  conditionalResolver: ConditionalResolverSignature<C, M>;
}

// TODO add linter if using conditionalResolver property should have undefined type.
export function Entity<C = object | Array<object>, M = object>(options?: EntityDecoratorOptions<C, M>) {
  return function (target: object, propertyKey: string) {
    const entityMap: Map<string, EntityDecoratorOptions<C, M> | undefined> = Reflect.getMetadata(ENTITY_KEY, target.constructor) ?? new Map();
    if (!entityMap.has(propertyKey)) {
      entityMap.set(propertyKey, options);
      Reflect.defineMetadata(ENTITY_KEY, entityMap, target.constructor);
    }
  };
}
