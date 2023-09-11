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
import { notEmpty } from "../utils/array";

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
  entityDecoratorOptions?: EntityDecoratorOptions;
  meta: object;
  parentData: object;
  dataAccessorName: string;
}

interface ArrayEntityRequestParams {
  typesList: Array<ClassConstructor<unknown>>;
  dataResourceList: Array<DataResourceEntity>;
  incomingPath: string;
  dataAccessorName: string;
  entityDecoratorOptions?: EntityDecoratorOptions;
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
    const targetEntities: Map<string, EntityDecoratorOptions> | undefined = Reflect.getMetadata(ENTITY_KEY, target);
    if (!targetEntities) return this.entityMap;
    const targetExposedProps = defaultMetadataStorage.getExposedMetadatas(target);
    const exposedEntityProps = targetExposedProps.filter(({ propertyName }) => targetEntities.has(propertyName ?? ""));
    const incomingPath = `${path}${path?.length ? "." : ""}`;

    for (const { propertyName, options } of exposedEntityProps) {
      const dataAccessorName = options.name || propertyName;
      if (!dataAccessorName) throw new Error("No data accessor property. Not possible to read entities from resolved data");

      const dataResource: Array<DataResourceEntity> | DataResourceEntity = get(data, dataAccessorName);

      if (propertyName) {
        const { options, reflectedType, typeFunction } = defaultMetadataStorage.findTypeMetadata(target, propertyName);
        const type = typeFunction() as ClassConstructor<unknown>;
        const subTypes = options.discriminator?.subTypes;

        const entityDecoratorOptions = targetEntities.get(propertyName ?? "");
        const params: ResolverParams = {
          subTypes,
          type,
          incomingPath,
          dataAccessorName
        };

        if (reflectedType.name === "Array" && Array.isArray(dataResource)) {
          await this.arrayTypeResolver(params, dataResource, data, entityDecoratorOptions);
        } else if (reflectedType.name === "Object" && !Array.isArray(dataResource)) {
          const shouldResolve = await this.conditionalResolver({
            entityDecoratorOptions,
            meta: dataResource.meta,
            parentData: data,
            dataAccessorName
          });
          if (!shouldResolve) continue;
          await this.objectTypeResolver(params, dataResource);
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

  private async objectTypeResolver({ incomingPath, type, subTypes, dataAccessorName }: ResolverParams, dataResource: DataResourceEntity) {
    const entity = this.createEntity(dataResource);
    entity.path = `${incomingPath}${dataAccessorName}`;
    entity.data = await this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`);
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

  private async arrayTypeResolver(
    { dataAccessorName, type, subTypes, incomingPath }: ResolverParams,
    dataResource: Array<DataResourceEntity>,
    parentData: object,
    entityDecoratorOptions?: EntityDecoratorOptions
  ) {
    const baseParams: Omit<ArrayEntityRequestParams, "typesList"> = {
      dataResourceList: dataResource,
      incomingPath,
      dataAccessorName,
      entityDecoratorOptions,
      parentData
    };
    if (subTypes) {
      const orderedSubTypes = dataResource
        .map((resourceEntity) => subTypes.find((type) => type.name === resourceEntity.type)?.value)
        .filter(notEmpty);
      await this.arrayEntityRequest({
        typesList: orderedSubTypes,
        ...baseParams
      });
    } else {
      const mappedTypes = dataResource.map(() => type);
      await this.arrayEntityRequest({
        typesList: mappedTypes,
        ...baseParams
      });
    }
  }

  private async arrayEntityRequest({
    typesList,
    dataResourceList,
    incomingPath,
    dataAccessorName,
    entityDecoratorOptions,
    parentData
  }: ArrayEntityRequestParams): Promise<void> {
    const resolveDataPromises: Array<Promise<{ type: ClassConstructor<unknown>; entity: Entity }>> = [];
    for (const [idx, type] of typesList.entries()) {
      const resourceEntity = dataResourceList[idx];
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

      resolveDataPromises.push(
        this.httpClient.get(`/${entity.entityTypeId}/${entity.bundleId}/${entity.id}`).then((data) => {
          const retrievedEntity = this.entityMap.get(entity.path!);
          if (!retrievedEntity) throw new Error("Error retrieving entity");
          retrievedEntity.data = data;
          return { type, entity: retrievedEntity };
        })
      );
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