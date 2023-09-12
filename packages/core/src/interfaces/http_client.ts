/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IHttpClient {
  get<D = any>(url: string, params?: Record<string, unknown>): Promise<D>;
}
