import type { TSESLint } from "@typescript-eslint/utils";
import exposeAllRule from "./expose_all_linter";
import recommended from "./recommended_rules";
export const rules = {
  "expose-all": exposeAllRule
} satisfies Record<string, TSESLint.RuleModule<string, Array<unknown>>>;

export const configs = {
  recommended
};
