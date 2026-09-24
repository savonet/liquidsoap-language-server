import type { Node } from "web-tree-sitter";

/** What a name means, in the vocabulary the protocol uses for highlighting. */
export type TokenType =
  "function" | "method" | "parameter" | "property" | "type" | "variable";

/** A name to highlight; offsets are JavaScript string indices. */
export interface Token {
  start: number;
  length: number;
  type: TokenType;
  /** Whether the name is being bound here. */
  declaration: boolean;
}

const argument = new Set(["anonymous_argument", "labeled_argument"]);
const binding = new Set(["binding", "let"]);

const inType = (node: Node): boolean => {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.type.endsWith("type")) return true;
  return false;
};

const bindsFunction = (node: Node): boolean =>
  node.namedChildren.find((child) => child?.type === "definition")?.namedChildren[0]
    ?.type === "anonymous_function";

const typeOf = (node: Node, parent: Node): TokenType => {
  if (inType(node)) return "type";
  if (node.type === "method")
    return parent.type === "method_app" ? "method" : "property";
  if (parent.type === "def") return "function";
  if (binding.has(parent.type)) return bindsFunction(parent) ? "function" : "variable";
  if (argument.has(parent.type)) return "parameter";
  if (parent.type === "app") return "function";
  if (parent.type === "method_app") return "method";
  return "variable";
};

const declares = (node: Node, parent: Node): boolean =>
  argument.has(parent.type) ||
  ((parent.type === "def" || binding.has(parent.type)) &&
    parent.childForFieldName("defined")?.id === node.id);

export const tokens = (root: Node): Token[] => {
  const found: Token[] = [];
  const visit = (node: Node) => {
    const parent = node.parent;
    // Recovering from a syntax error can leave a node with no text.
    if (
      parent &&
      node.endIndex > node.startIndex &&
      (node.type === "var" || node.type === "method")
    )
      found.push({
        start: node.startIndex,
        length: node.endIndex - node.startIndex,
        type: typeOf(node, parent),
        declaration: declares(node, parent),
      });
    for (const child of node.namedChildren) if (child) visit(child);
  };
  visit(root);
  return found.sort((a, b) => a.start - b.start);
};
