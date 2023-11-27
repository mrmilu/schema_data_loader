import type { ClassConstructor } from "class-transformer";
import type { ClassTransformerSubType, ResolverGetOptions } from "../interfaces/entity_resolver_service";
import type { EntityDecoratorOptions } from "../decorators/entity";
import { ENTITY_KEY } from "../decorators/entity";
import type { DataResourceEntity } from "../interfaces/data_resource_entity";
import type { IHttpClient } from "../interfaces/http_client";
import { Entity } from "./entity";
import { defaultMetadataStorage } from "class-transformer/cjs/storage.js";
import get from "lodash/get";
import set from "lodash/set";

interface ResolveEntitiesAndDataParams<T, C> {
  target: ClassConstructor<T>;
  data: object;
  path?: string;
  options?: ResolverGetOptions<C>;
}

interface ResolverParams {
  subTypes?: Array<ClassTransformerSubType>;
  type: ClassConstructor<unknown>;
  incomingPath: string;
  dataAccessorName: string;
}

interface ConditionalResolverParams {
  entityDecoratorOptions?: EntityDecoratorOptions<unknown>;
  meta?: object;
  parentData: object;
  dataAccessorName: string;
}

interface ArrayEntityRequestParams {
  typeOrTypes: Array<ClassTransformerSubType> | ClassConstructor<unknown>;
  dataResourceList: Array<DataResourceEntity>;
  incomingPath: string;
  dataAccessorName: string;
  entityDecoratorOptions?: EntityDecoratorOptions<unknown>;
  parentData: object;
}

export class EntityResolver<C> {
  private httpClient: IHttpClient;
  private entityMap: Map<string, Entity> = new Map();
  options?: ResolverGetOptions<C>;

  constructor(httpClient: IHttpClient, options?: ResolverGetOptions<C>) {
    this.options = options;
    this.httpClient = httpClient;
  }

  async execute<T>({ path, data, target }: ResolveEntitiesAndDataParams<T, C>): Promise<Map<string, Entity>> {
    const targetEntities: Map<string, EntityDecoratorOptions<unknown>> | undefined = Reflect.getMetadata(ENTITY_KEY, target);

    if (!targetEntities) return this.entityMap;

    const targetExposedProps = defaultMetadataStorage.getExposedMetadatas(target);
    const exposedEntityProps = targetExposedProps.filter(({ propertyName }) => targetEntities.has(propertyName ?? ""));
    const incomingPath = `${path}${path?.length ? "." : ""}`;

    for (const { propertyName, options } of exposedEntityProps) {
      const dataAccessorName = options.name || propertyName;
      if (!dataAccessorName) throw new Error("No data accessor property. Not possible to read entities from resolved data");

      const dataResource: Array<DataResourceEntity> | DataResourceEntity | undefined = get(data, dataAccessorName);

      if (dataResource === undefined) continue;

      if (propertyName) {
        const { options, reflectedType, typeFunction } = defaultMetadataStorage.findTypeMetadata(target, propertyName);
        const type = typeFunction() as ClassConstructor<unknown>;
        const subTypes = options.discriminator?.subTypes;
        let reflectTypeName = reflectedType?.name;

        const entityDecoratorOptions = targetEntities.get(propertyName ?? "");

        if (!reflectTypeName) {
          reflectTypeName = typeFunction().constructor.name;
        } else if (reflectTypeName !== "Object" && reflectTypeName !== "Array") {
          reflectTypeName = reflectedType.constructor.name;
        }

        if (reflectTypeName === "Array" && Array.isArray(dataResource)) {
          const baseParams: Omit<ArrayEntityRequestParams, "typeOrTypes" | "dataResourceList"> = {
            incomingPath,
            dataAccessorName,
            entityDecoratorOptions,
            parentData: data
          };

          if (subTypes) {
            const dataResourceList = dataResource.filter((resourceEntity) => subTypes.find((type) => type.name === resourceEntity.type)?.value);

            await this.arrayEntityRequest({
              typeOrTypes: subTypes,
              dataResourceList,
              ...baseParams
            });
          } else {
            await this.arrayEntityRequest({
              typeOrTypes: type,
              dataResourceList: dataResource,
              ...baseParams
            });
          }
        } else if ((reflectTypeName === "Object" || reflectTypeName === "Function") && !Array.isArray(dataResource)) {
          const shouldResolve = await this.conditionalResolver({
            entityDecoratorOptions,
            meta: dataResource.meta,
            parentData: data,
            dataAccessorName
          });
          if (!shouldResolve) continue;
          const params: ResolverParams = {
            subTypes,
            type,
            incomingPath,
            dataAccessorName
          };
          await this.objectTypeResolver(params, dataResource, entityDecoratorOptions?.parentEntityHolder ?? false);
        }
      }
    }
    return this.entityMap;
  }

  private async conditionalResolver({ entityDecoratorOptions, dataAccessorName, parentData, meta }: ConditionalResolverParams): Promise<boolean> {
    if (entityDecoratorOptions?.conditionalResolver) {
      const hasIndexMatch = dataAccessorName.match(/\[(.*?)]/);
      const sanitizedMatch = hasIndexMatch?.[0].replace("[", "").replace("]", "");
      const idx = sanitizedMatch ? parseInt(sanitizedMatch) : undefined;
      const shouldResolve = entityDecoratorOptions.conditionalResolver(this.options?.context ?? {}, meta || {}, idx);
      if (!shouldResolve) {
        set(parentData, dataAccessorName, idx !== undefined ? {} : undefined);
      }
      return shouldResolve;
    }
    return true;
  }

  private async objectTypeResolver(
    { incomingPath, type, subTypes, dataAccessorName }: ResolverParams,
    dataResource: DataResourceEntity,
    parentEntityHolder: boolean
  ) {
    const entity = this.createEntity(dataResource);
    entity.path = `${incomingPath}${dataAccessorName}`;

    if (parentEntityHolder) {
      entity.data = dataResource;
    } else {
      entity.data = await this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`);
    }

    this.entityMap.set(entity.path, entity);

    if (!entity.data) throw new Error("Entity has no resolved data");

    if (subTypes) {
      const correspondingSubType = subTypes.find((subType) => subType.name === entity.type);
      if (!correspondingSubType) throw new Error("Error retrieving subtype for object entity union");
      await this.execute({
        target: correspondingSubType.value,
        data: entity.data,
        path: entity.path
      });
    } else {
      await this.execute({ target: type, data: entity.data, path: entity.path });
    }
  }

  // TODO remove
  private async arrayTypeResolver(
    { dataAccessorName, type, subTypes, incomingPath }: ResolverParams,
    dataResource: Array<DataResourceEntity>,
    parentData: object,
    entityDecoratorOptions?: EntityDecoratorOptions<unknown>
  ) {
    const baseParams: Omit<ArrayEntityRequestParams, "typeOrTypes"> = {
      dataResourceList: dataResource,
      incomingPath,
      dataAccessorName,
      entityDecoratorOptions,
      parentData
    };
    if (subTypes) {
      await this.arrayEntityRequest({
        typeOrTypes: subTypes,
        ...baseParams
      });
    } else {
      await this.arrayEntityRequest({
        typeOrTypes: type,
        ...baseParams
      });
    }
  }

  private async arrayEntityRequest({
    typeOrTypes,
    dataResourceList,
    incomingPath,
    dataAccessorName,
    entityDecoratorOptions,
    parentData
  }: ArrayEntityRequestParams): Promise<void> {
    const resolveDataPromises: Array<Promise<{ type: ClassConstructor<unknown>; entity: Entity }>> = [];
    for (const [idx, resourceEntity] of dataResourceList.entries()) {
      let type: ClassConstructor<unknown> | undefined;
      if (Array.isArray(typeOrTypes)) {
        type = typeOrTypes.find((subType) => subType.name === resourceEntity.type)?.value;
      } else {
        type = typeOrTypes;
      }
      if (!type) {
        throw new Error("Type for resource entity was not found");
      }
      const dataAccessor = `${dataAccessorName}[${idx}]`;

      const shouldResolve = await this.conditionalResolver({
        entityDecoratorOptions,
        meta: resourceEntity.meta,
        parentData: parentData,
        dataAccessorName: dataAccessor
      });
      if (!shouldResolve) continue;

      const entity = this.createEntity(resourceEntity);
      entity.path = `${incomingPath}${dataAccessor}`;
      this.entityMap.set(entity.path, entity);

      if (entityDecoratorOptions?.parentEntityHolder) {
        entity.data = resourceEntity;
        const data = { type, entity };
        resolveDataPromises.push(Promise.resolve(data));
      } else {
        resolveDataPromises.push(
          this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`).then((data) => {
            const retrievedEntity = this.entityMap.get(entity.path!);
            if (!retrievedEntity) throw new Error("Error retrieving entity");
            retrievedEntity.data = data;
            return { type: type as ClassConstructor<unknown>, entity: retrievedEntity };
          })
        );
      }
    }

    const resolvedData = await Promise.all(resolveDataPromises);

    const concurrentPromises = [];
    for (const item of resolvedData) {
      if (!item) continue;
      const { entity, type } = item;
      if (!entity.data) throw new Error("Entity has no resolved data");
      concurrentPromises.push(
        this.execute({
          target: type,
          data: entity.data,
          path: entity.path
        })
      );
    }
    await Promise.all(concurrentPromises);
  }

  private createEntity(dataResource: DataResourceEntity) {
    return new Entity({ type: dataResource.type, id: dataResource.id, meta: dataResource.meta });
  }
}
