export const ENTITY_KEY = Symbol("entity");

export interface EntityDecoratorOptions<C = object> {
  conditionalResolver: (context: C) => boolean;
}

// TODO add linter if using conditionalResolver property should have undefined type.
export function Entity<C>(options?: EntityDecoratorOptions<C>) {
  return function (target: object, propertyKey: string) {
    const entityMap: Map<string, EntityDecoratorOptions<C> | undefined> = Reflect.getMetadata(ENTITY_KEY, target.constructor) ?? new Map();
    if (!entityMap.has(propertyKey)) {
      entityMap.set(propertyKey, options);
      Reflect.defineMetadata(ENTITY_KEY, entityMap, target.constructor);
    }
  };
}
