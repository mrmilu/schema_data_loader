/* eslint-disable @typescript-eslint/no-var-requires */
import type { ClassTransformerSubType, IEntityResolverService, ResolverGetOptions } from "../interfaces/entity_resolver_service";
import { Entity } from "../models/entity";
import type { ClassConstructor } from "class-transformer";
import { plainToInstance } from "class-transformer";
import type { IHttpClient } from "../interfaces/http_client";
import { defaultMetadataStorage } from "class-transformer/cjs/storage.js";
import type { EntityDecoratorOptions } from "../decorators/entity";
import { ENTITY_KEY } from "../decorators/entity";
import type { DataResourceEntity } from "../interfaces/data_resource_entity";

const get = require("lodash/get");
const set = require("lodash/set");

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

interface ResolveEntitiesAndDataParams<T, C> {
  target: ClassConstructor<T>;
  data: object;
  path?: string;
  options?: ResolverGetOptions<C>;
}

interface ResolverConfig<C> {
  subTypes: Array<ClassTransformerSubType> | undefined;
  type: ClassConstructor<unknown>;
  incomingPath: string;
  dataAccessorName: string | undefined;
  options?: ResolverGetOptions<C>;
}

export class EntityResolverService implements IEntityResolverService {
  private httpClient: IHttpClient;
  private entityMap: Map<string, Entity> = new Map();
  private promises: Array<Promise<void>> = [];

  constructor(httpClient: IHttpClient) {
    this.httpClient = httpClient;
  }

  async get<T, C>(target: ClassConstructor<T>, data: object, options?: ResolverGetOptions<C>): Promise<T> {
    await this.resolveEntitiesAndData<T, C>({ target, data, options, path: "" });
    return plainToInstance(target, this.rebuildResolvedData(data) ?? {}, { excludeExtraneousValues: true });
  }

  private rebuildResolvedData(data: object): object | null {
    let rebuiltData: object | null = null;
    for (const entity of this.entityMap.values()) {
      rebuiltData = set(data, entity.path, entity.resolvedData);
    }
    return rebuiltData;
  }

  private async resolveEntitiesAndData<T, C>({ path, data, options: getOptions, target }: ResolveEntitiesAndDataParams<T, C>): Promise<void> {
    const targetEntities: Map<string, EntityDecoratorOptions> | undefined = Reflect.getMetadata(ENTITY_KEY, target);
    if (!targetEntities) return;
    const targetExposedProps = defaultMetadataStorage.getExposedMetadatas(target);
    const exposedEntityProps = targetExposedProps.filter(({ propertyName }) => targetEntities.has(propertyName ?? ""));
    const incomingPath = `${path}${path?.length ? "." : ""}`;

    for (const { propertyName, options } of exposedEntityProps) {
      const dataAccessorName = options.name || propertyName;
      if (!dataAccessorName) throw new Error("No data accessor property. Not possible to read entities from resolved data");

      const entityDecoratorOptions = targetEntities.get(propertyName ?? "");
      if (entityDecoratorOptions?.conditionalResolver) {
        const shouldResolve = entityDecoratorOptions.conditionalResolver(getOptions?.context ?? {});
        if (!shouldResolve) {
          set(data, dataAccessorName, undefined);
          return;
        }
      }

      const dataResource: Array<DataResourceEntity> | DataResourceEntity = get(data, dataAccessorName);

      if (propertyName) {
        const { options, reflectedType, typeFunction } = defaultMetadataStorage.findTypeMetadata(target, propertyName);
        const type = typeFunction() as ClassConstructor<any>;
        const subTypes = options.discriminator?.subTypes;

        if (reflectedType.name === "Array" && Array.isArray(dataResource)) {
          await this.arrayTypeResolver(
            {
              subTypes,
              type,
              incomingPath,
              dataAccessorName,
              options: getOptions
            },
            dataResource
          );
        } else if (reflectedType.name === "Object" && !Array.isArray(dataResource)) {
          await this.objectTypeResolver(
            {
              subTypes,
              type,
              incomingPath,
              dataAccessorName,
              options: getOptions
            },
            dataResource
          );
        }
      }
    }
  }

  private async objectTypeResolver<C>(
    { incomingPath, type, subTypes, dataAccessorName, options }: ResolverConfig<C>,
    dataResource: DataResourceEntity
  ) {
    const entity = new Entity({ type: dataResource.type, id: dataResource.id });
    entity.path = `${incomingPath}${dataAccessorName}`;
    entity.resolvedData = await this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`);
    this.entityMap.set(entity.path, entity);
    if (!entity.resolvedData) throw new Error("Entity has no resolved data");
    if (subTypes) {
      const correspondingSubType = subTypes.find((subType) => subType.name === entity.type);
      if (!correspondingSubType) throw new Error("Error retrieving subtype for object entity union");
      await this.resolveEntitiesAndData({
        target: correspondingSubType.value,
        data: entity.resolvedData,
        path: entity.path
      });
    } else {
      await this.resolveEntitiesAndData({ target: type, data: entity.resolvedData, path: entity.path, options });
    }
  }

  private async arrayTypeResolver<C>(
    { dataAccessorName, type, subTypes, incomingPath, options }: ResolverConfig<C>,
    dataResource: Array<DataResourceEntity>
  ) {
    if (subTypes) {
      const orderedSubTypes = dataResource
        .map((resourceEntity) => subTypes.find((type) => type.name === resourceEntity.type)?.value)
        .filter(notEmpty);
      await this.arrayEntityRequest(orderedSubTypes, dataResource, incomingPath, dataAccessorName, options);
    } else {
      const mappedTypes = dataResource.map(() => type);
      await this.arrayEntityRequest(mappedTypes, dataResource, incomingPath, dataAccessorName, options);
    }
  }

  private async arrayEntityRequest<C>(
    typesList: Array<ClassConstructor<unknown>>,
    dataResourceList: Array<DataResourceEntity>,
    incomingPath: string,
    dataAccessorName: string | undefined,
    options?: ResolverGetOptions<C>
  ): Promise<void> {
    const resolveDataPromises: Array<Promise<{ type: ClassConstructor<unknown>; entity: Entity }>> = [];
    for (const [idx, type] of typesList.entries()) {
      const resourceEntity = dataResourceList[idx];
      const entity = new Entity({ type: resourceEntity.type, id: resourceEntity.id });
      entity.path = `${incomingPath}${dataAccessorName}[${idx}]`;
      this.entityMap.set(entity.path, entity);
      resolveDataPromises.push(
        this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`).then((data) => {
          const retrievedEntity = this.entityMap.get(entity.path!);
          if (!retrievedEntity) throw new Error("Error retrieving entity");
          retrievedEntity.resolvedData = data;
          return { type, entity: retrievedEntity };
        })
      );
    }
    const resolved = await Promise.all(resolveDataPromises);
    const concurrentPromises = [];
    for (const { entity, type } of resolved) {
      if (!entity.resolvedData) throw new Error("Entity has no resolved data");
      concurrentPromises.push(
        this.resolveEntitiesAndData({
          target: type,
          data: entity.resolvedData,
          path: entity.path,
          options
        })
      );
    }
    await Promise.all(concurrentPromises);
  }
}
