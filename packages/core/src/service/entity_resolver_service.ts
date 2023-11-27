/* eslint-disable @typescript-eslint/no-var-requires */
import type { IEntityResolverService, ResolverGetOptions } from "../interfaces/entity_resolver_service";
import type { Entity } from "../models/entity";
import type { ClassConstructor } from "class-transformer";
import { plainToInstance } from "class-transformer";
import type { IHttpClient } from "../interfaces/http_client";
import { EntityResolver } from "../models/entity_resolver";

const set = require("lodash/set");

export class EntityResolverService implements IEntityResolverService {
  private readonly httpClient: IHttpClient;

  constructor(httpClient: IHttpClient) {
    this.httpClient = httpClient;
  }

  async get<T, C>(target: ClassConstructor<T>, data: object, options?: ResolverGetOptions<C>): Promise<T> {
    const entityResolver = new EntityResolver<C>(this.httpClient, options);
    const entityMap = await entityResolver.execute<T>({ target, data, options, path: "" });
    const rebuiltData = this.rebuildResolvedData(entityMap, data) ?? {};
    if (options?.raw) {
      return rebuiltData as T;
    }
    return plainToInstance(target, rebuiltData, { excludeExtraneousValues: true });
  }

  private rebuildResolvedData(entityMap: Map<string, Entity>, data: object): object | null {
    let rebuiltData: object = structuredClone(data);
    for (const entity of entityMap.values()) {
      rebuiltData = set(data, entity.path, { ...entity.data, _meta: entity.meta });
    }
    return rebuiltData;
  }
}
