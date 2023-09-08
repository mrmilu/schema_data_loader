import { defaultMetadataStorage } from "class-transformer/cjs/storage.js";
import { Union as UnionObject } from "../models/union";
import type { ClassTransformerSubType } from "../interfaces/entity_resolver_service";

export const UNION_KEY = Symbol("union");

interface UnionDecoratorOptions {
  discriminatorProperty?: string;
  subTypes: Array<ClassTransformerSubType>;
}

export function Union({ discriminatorProperty = "type", subTypes = [] }: UnionDecoratorOptions) {
  return function (target: object, propertyKey: string) {
    const reflectedType = Reflect.getMetadata("design:type", target, propertyKey);
    defaultMetadataStorage.addTypeMetadata({
      target: target.constructor,
      propertyName: propertyKey,
      reflectedType,
      typeFunction: () => UnionObject,
      options: {
        discriminator: {
          property: discriminatorProperty,
          subTypes
        }
      }
    });
    if (reflectedType.name === "Array") {
      defaultMetadataStorage.addTransformMetadata({
        target: target.constructor,
        propertyName: propertyKey,
        transformFn: ({ value }) => value?.filter((v: unknown) => !(v instanceof UnionObject)),
        options: {}
      });
    }
  };
}
