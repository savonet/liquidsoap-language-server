import type { Node } from "web-tree-sitter";

/** A definition in a script; offsets are JavaScript string indices. */
export interface Definition {
  name: string;
  kind: "function" | "value";
  start: number;
  end: number;
  nameStart: number;
  nameEnd: number;
  children: Definition[];
}

const definitionTypes = new Set(["binding", "def", "let"]);

const isFunction = (node: Node): boolean =>
  node.childForFieldName("arguments") !== null ||
  node.children.some(
    (child) =>
      child?.type === "definition" &&
      child.namedChildren.length === 1 &&
      child.namedChildren[0]?.type === "anonymous_function",
  );

// Definitions nested in a `def`'s body are its children; those in any other
// expression are not listed.
export const definitions = (node: Node): Definition[] =>
  node.namedChildren.flatMap((child) => {
    if (!child || !definitionTypes.has(child.type)) return [];
    const name = child.childForFieldName("defined");
    if (!name) return [];
    const body = child.children.find((c) => c?.type === "definition");
    // The grammar's `defined` field runs up to the `=` of a binding.
    const text = name.text.trimEnd();
    return [
      {
        name: text,
        kind: isFunction(child) ? "function" : "value",
        start: child.startIndex,
        end: child.endIndex,
        nameStart: name.startIndex,
        nameEnd: name.startIndex + text.length,
        children: child.type === "def" && body ? definitions(body) : [],
      },
    ];
  });
