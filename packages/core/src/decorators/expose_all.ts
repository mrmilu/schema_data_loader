import { defaultMetadataStorage } from "class-transformer/cjs/storage.js";
import type { ExposeOptions } from "class-transformer";

const camelCase = require("lodash/camelCase");
const snakeCase = require("lodash/snakeCase");

export type ExposeAllCasing = "camelCase" | "snakeCase";

interface ExposeAllOptions {
  nameCasing?: ExposeAllCasing;
}

// TODO linter that when using decorator all properties must have a default value.
export function ExposeAll(options?: ExposeAllOptions) {
  const { nameCasing } = options || {};
  return function (target: any) {
    const object = new target();
    Object.entries(object).forEach(([key]) => {
      const exists = defaultMetadataStorage.findExposeMetadata(target, key);
      if (exists) return;

      const options: ExposeOptions = {};
      switch (nameCasing) {
        case "camelCase":
          options.name = camelCase(key);
          break;
        case "snakeCase":
          options.name = snakeCase(key);
          break;
      }

      defaultMetadataStorage.addExposeMetadata({
        target: target,
        propertyName: key,
        options
      });
    });
  };
}

export function Test() {
  return function (target: any, propertyKey: string) {
    // console.log("prop decorator", target.constructor);
  };
}
