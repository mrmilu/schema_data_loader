import { Expose } from "class-transformer";

export class WithMeta<M = object> {
  @Expose()
  _meta?: M;
}
