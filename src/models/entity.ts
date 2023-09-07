export class Entity<T = object, M = object> {
  type: string;
  id: string;
  data?: T;
  path?: string;
  meta?: M;

  constructor(params: Omit<Entity<T, M>, "path" | "data" | "entityTypeId" | "bundleId">) {
    this.id = params.id;
    this.type = params.type;
    this.meta = params.meta;
  }

  get entityTypeId() {
    return this.type.split("--")[0];
  }

  get bundleId() {
    return this.type.split("--")[1];
  }
}
