import type { TSESTree } from "@typescript-eslint/utils";
import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";

type MessageIds = "conditionalResolver" | "conditionalResolverArray";

type Options = [];

function nodeIsArray(node: TSESTree.PropertyDefinition): boolean {
  const typeReference = node.typeAnnotation?.typeAnnotation;
  if (typeReference?.type === AST_NODE_TYPES.TSTypeReference) {
    const _typeReference = typeReference as TSESTree.TSTypeReference;
    return (_typeReference.typeName as TSESTree.Identifier).name === "Array";
  }
  return false;
}

const conditionalResolverRule = ESLintUtils.RuleCreator.withoutDocs<Options, MessageIds>({
  create(context) {
    return {
      PropertyDefinition(node) {
        const keyLoc = node.key.loc;
        const isArrayType = nodeIsArray(node);
        let valueIsUndefined = false;
        if (!isArrayType) {
          const valueIsIdentifier = node.value?.type === AST_NODE_TYPES.Identifier;
          if (valueIsIdentifier) {
            const value = node.value as TSESTree.Identifier;
            valueIsUndefined = value.name === "undefined";
          }
        }

        for (const decorator of node.decorators) {
          const checks = { hasEntityDecorator: false, hasConditionalResolver: false };
          const expression = decorator.expression as TSESTree.CallExpression;
          const callee = expression.callee as TSESTree.Identifier;
          checks.hasEntityDecorator = callee.name === "Entity";

          if (checks.hasEntityDecorator && isArrayType) {
            const valueIsArray = node.value?.type === AST_NODE_TYPES.ArrayExpression;
            if (valueIsArray) {
              const value = node.value as TSESTree.ArrayExpression;
              if (value.elements.length) {
                context.report({
                  node,
                  messageId: "conditionalResolverArray",
                  loc: keyLoc
                });
              }
            } else {
              context.report({
                node,
                messageId: "conditionalResolverArray",
                loc: keyLoc
              });
            }
          } else if (checks.hasEntityDecorator && !isArrayType) {
            const optionsObj = expression.arguments.find((arg) => arg.type === AST_NODE_TYPES.ObjectExpression) as
              | TSESTree.ObjectExpression
              | undefined;
            const hasConditionalResolver = optionsObj?.properties.some((prop) => {
              const _key = (prop as TSESTree.Property).key;
              return (_key as TSESTree.Identifier).name === "conditionalResolver";
            });
            if (hasConditionalResolver && !valueIsUndefined) {
              context.report({
                node,
                messageId: "conditionalResolver",
                loc: keyLoc
              });
            }
          }
        }
      }
    };
  },
  defaultOptions: [],
  meta: {
    type: "problem",
    messages: {
      conditionalResolver: "When using @Entity decorator with 'conditionalResolver' option the property value must be 'undefined'",
      conditionalResolverArray:
        "When using @Entity decorator with 'conditionalResolver' option and with a type Array the property value must be an empty Array"
    },
    schema: []
  }
});

export default conditionalResolverRule;
