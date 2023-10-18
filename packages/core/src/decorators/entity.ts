export const ENTITY_KEY = Symbol("entity");

type ConditionalResolverSignature<C, M> = (context: C, meta: M, idx?: number) => boolean;

export interface EntityDecoratorOptions<C, M = object> {
  conditionalResolver?: ConditionalResolverSignature<C, M>;
  parentEntityHolder: boolean;
}

export function Entity<C, M = object>(options?: Omit<EntityDecoratorOptions<C, M>, "parentEntityHolder">) {
  return function (target: object, propertyKey: string) {
    const entityMap: Map<string, EntityDecoratorOptions<C, M> | undefined> = Reflect.getMetadata(ENTITY_KEY, target.constructor) ?? new Map();
    if (!entityMap.has(propertyKey)) {
      entityMap.set(propertyKey, { parentEntityHolder: false, ...options });
      Reflect.defineMetadata(ENTITY_KEY, entityMap, target.constructor);
    }
  };
}

export function HasEntity() {
  return function (target: object, propertyKey: string) {
    const entityMap: Map<string, EntityDecoratorOptions<object> | undefined> = Reflect.getMetadata(ENTITY_KEY, target.constructor) ?? new Map();
    if (!entityMap.has(propertyKey)) {
      entityMap.set(propertyKey, { parentEntityHolder: true });
      Reflect.defineMetadata(ENTITY_KEY, entityMap, target.constructor);
    }
  };
}
