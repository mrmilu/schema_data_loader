import type { TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";

type MessageIds = "exposeAll";

type Options = [];

const exposeAllRule = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
  create(context) {
    return {
      ClassDeclaration(node) {
        if (node.body.type === AST_NODE_TYPES.ClassBody) {
          const propsWithNullVal = node.body.body
            .filter((el) => el.type === AST_NODE_TYPES.PropertyDefinition)
            .some((el) => {
              const _el = el as TSESTree.PropertyDefinition;
              return !_el.value;
            });
          const hasExposeAll = node.decorators.some((decorator) => {
            const callee = (decorator.expression as TSESTree.CallExpression).callee as TSESTree.Identifier;
            return callee.name === "ExposeAll";
          });
          if (propsWithNullVal && hasExposeAll) {
            context.report({
              node,
              messageId: "exposeAll"
            });
          }
        }
      }
    };
  },
  defaultOptions: [],
  meta: {
    type: "problem",
    messages: {
      exposeAll: "When using @ExposeAll decorator all class properties must have a default value"
    },
    schema: []
  }
});

export default exposeAllRule;
