export class Entity<T = object> {
  type: string;
  id: string;
  resolvedData?: T;
  path?: string;

  constructor(params: Omit<Entity<T>, "path" | "resolvedData" | "entityTypeId" | "bundleId">) {
    this.id = params.id;
    this.type = params.type;
  }

  get entityTypeId() {
    return this.type.split("--")[0];
  }

  get bundleId() {
    return this.type.split("--")[1];
  }
}
