import * as path from "node:path";
import { Language, Node, Parser } from "web-tree-sitter";

/** A replacement in the original source; offsets are JavaScript string indices. */
export interface Edit {
  start: number;
  end: number;
  text: string;
}

export interface SyntaxError {
  start: number;
  end: number;
  /** What tree-sitter expected here, e.g. "`end`" or "an expression". */
  missing?: string;
}

export interface Patched {
  source: string;
  edits: Edit[];
  errors: SyntaxError[];
}

const placeholder = "💣()";

const sequenceContainers = new Set([
  "source_file",
  "definition",
  "block",
  "if_then",
  "if_else",
  "elsif_then",
  "for_do",
  "while_do",
  "try_body",
  "try_do",
  "try_finally",
]);

const statementOf = (node: Node): Node => {
  while (node.parent && !sequenceContainers.has(node.parent.type))
    node = node.parent;
  return node;
};

const startsLine = (source: string, node: Node): boolean => {
  const lineStart = source.lastIndexOf("\n", node.startIndex - 1) + 1;
  return source.slice(lineStart, node.startIndex).trim() === "";
};

// Tree-sitter nests the statements it recovered after the damage inside the
// ERROR node; keeping them is what keeps every later binding in scope.
const isRecoveredStatement = (
  source: string,
  child: Node,
  error: Node,
): boolean =>
  child.isNamed &&
  child.type !== "ERROR" &&
  child.startPosition.row > error.startPosition.row &&
  child.startPosition.column <= error.startPosition.column &&
  startsLine(source, child);

// Keeping the name bound is what keeps a broken definition from changing what
// the rest of the script means.
const replacementText = (nodes: Node[]): string => {
  for (let i = 0; i < nodes.length - 1; i++) {
    const [keyword, name, args] = [nodes[i], nodes[i + 1], nodes[i + 2]];
    if (keyword.type === "def" && name.type === "var" && args?.type === "arglist")
      return `def ${name.text}${args.text} = ${placeholder} end`;
    if ((keyword.type === "def" || keyword.type === "let") && name.type === "var")
      return `${name.text} = ${placeholder}`;
    if (keyword.type === "var" && name.type === "=")
      return `${keyword.text} = ${placeholder}`;
  }
  return placeholder;
};

const replace = (nodes: Node[]): Edit => {
  const first = nodes[0];
  const before = first.previousSibling;
  const sameLine = before && before.endPosition.row === first.startPosition.row;
  return {
    start: first.startIndex,
    end: nodes[nodes.length - 1].endIndex,
    text: (sameLine ? "; " : "") + replacementText(nodes),
  };
};

// Aliased keywords such as `def_end` are all spelled `end`.
const missingText = (node: Node): string =>
  node.isNamed ? placeholder : node.type.replace(/^\w+_end$/, "end");

const collect = (source: string, node: Node, edits: Edit[]): void => {
  if (node.isMissing) {
    edits.push({
      start: node.startIndex,
      end: node.startIndex,
      text: ` ${missingText(node)} `,
    });
    return;
  }
  if (node.type !== "ERROR") {
    for (const child of node.children) collect(source, child, edits);
    return;
  }
  const children = node.children;
  if (!children.some((child) => isRecoveredStatement(source, child, node))) {
    const target = statementOf(node);
    edits.push(
      replace(target === node && children.length ? children : [target]),
    );
    return;
  }
  let loose: Node[] = [];
  for (const child of children) {
    if (isRecoveredStatement(source, child, node)) {
      if (loose.length) edits.push(replace(loose));
      loose = [];
      collect(source, child, edits);
    } else loose.push(child);
  }
  if (loose.length) edits.push(replace(loose));
};

// A replaced statement already covers any edit inside it.
const outermost = (edits: Edit[]): Edit[] => {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Edit[] = [];
  for (const edit of sorted) {
    const last = kept[kept.length - 1];
    if (!last || edit.start >= last.end) kept.push(edit);
  }
  return kept;
};

const syntaxErrors = (root: Node): SyntaxError[] => {
  const errors: SyntaxError[] = [];
  const visit = (node: Node): void => {
    if (node.isMissing)
      errors.push({
        start: node.startIndex,
        end: node.startIndex,
        missing: node.isNamed ? "an expression" : `\`${missingText(node)}\``,
      });
    else if (node.type === "ERROR")
      errors.push({ start: node.startIndex, end: node.endIndex });
    else for (const child of node.children) visit(child);
  };
  visit(root);
  return errors;
};

const apply = (source: string, edits: Edit[]): string => {
  let patched = "";
  let offset = 0;
  for (const edit of edits) {
    patched += source.slice(offset, edit.start) + edit.text;
    offset = edit.end;
  }
  return patched + source.slice(offset);
};

const locate = (
  edits: Edit[],
  offset: number,
): { original: number; patched: boolean } => {
  let delta = 0;
  for (const edit of edits) {
    const start = edit.start + delta;
    if (offset < start) break;
    if (offset < start + edit.text.length)
      return { original: edit.start, patched: true };
    delta += edit.text.length - (edit.end - edit.start);
  }
  return { original: offset - delta, patched: false };
};

/** Maps an offset in the patched source back to the original source. */
export const originalOffset = (edits: Edit[], offset: number): number =>
  locate(edits, offset).original;

/** Whether an offset in the patched source falls in text the patcher wrote. */
export const isPatched = (edits: Edit[], offset: number): boolean =>
  locate(edits, offset).patched;

// Lines that continue the statement above rather than start a new one.
const closingLine =
  /^(end|else|elsif|then|do|catch|finally|%else|%endif)\b|^[)\]}]/;

const blockOpeners = new Set(["def", "begin", "if", "while", "for", "try"]);
const isBlockCloser = (type: string) => type === "end" || type.endsWith("_end");

// Keyword depth at the start of each line. Keywords are reserved, so their
// tokens are reliable even where tree-sitter could not parse; brackets are left
// out since an unclosed one is the usual damage.
const depthAtLineStarts = (root: Node, lineCount: number): number[] => {
  const changes = new Array<number>(lineCount + 1).fill(0);
  const visit = (node: Node): void => {
    if (node.childCount === 0) {
      if (blockOpeners.has(node.type)) changes[node.startPosition.row + 1]++;
      else if (isBlockCloser(node.type)) changes[node.startPosition.row + 1]--;
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  const depths: number[] = [];
  let depth = 0;
  for (let row = 0; row < lineCount; row++) {
    depth = Math.max(0, depth + changes[row]);
    depths.push(depth);
  }
  return depths;
};

// A top-level statement starts on a line at column 0 outside of any block, so
// both indented and unindented code split the same way.
const topLevelChunks = (
  source: string,
  root: Node,
): { start: number; end: number }[] => {
  const lines = source.split("\n");
  const depths = depthAtLineStarts(root, lines.length);
  const starts = [0];
  let offset = 0;
  lines.forEach((line, row) => {
    if (
      offset > 0 &&
      depths[row] === 0 &&
      /^\S/.test(line) &&
      !line.startsWith("#") &&
      !closingLine.test(line)
    )
      starts.push(offset);
    offset += line.length + 1;
  });
  return starts.map((start, i) => ({
    start,
    end: i + 1 < starts.length ? starts[i + 1] : source.length,
  }));
};

const shifted = <T extends { start: number; end: number }>(
  items: T[],
  by: number,
): T[] =>
  items.map((item) => ({ ...item, start: item.start + by, end: item.end + by }));

/**
 * Maps an offset in the original source to the patched source, or `undefined`
 * when the patcher replaced the text there.
 */
export const patchedOffset = (
  edits: Edit[],
  offset: number,
): number | undefined => {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start) break;
    if (offset < edit.end) return undefined;
    delta += edit.text.length - (edit.end - edit.start);
  }
  return offset + delta;
};

export type Patcher = (source: string) => Patched;

export const createPatcher = async (
  grammar = path.join(__dirname, "..", "grammar", "tree-sitter-liquidsoap.wasm"),
): Promise<Patcher> => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(grammar));
  const withTree = <T>(source: string, fn: (root: Node) => T): T => {
    const tree = parser.parse(source);
    if (!tree) throw new Error("tree-sitter returned no tree.");
    try {
      return fn(tree.rootNode);
    } finally {
      tree.delete();
    }
  };

  const patchWhole = (root: Node, source: string) => {
    const edits: Edit[] = [];
    collect(source, root, edits);
    return { edits, errors: syntaxErrors(root) };
  };

  // tree-sitter's recovery can carry an unclosed bracket across the rest of
  // the file, so each top-level statement it flagged is reparsed on its own.
  const patchChunks = (root: Node, source: string) => {
    const flagged = syntaxErrors(root);
    const edits: Edit[] = [];
    const errors: SyntaxError[] = [];
    for (const chunk of topLevelChunks(source, root)) {
      if (!flagged.some((e) => e.start < chunk.end && e.end >= chunk.start))
        continue;
      const text = source.slice(chunk.start, chunk.end);
      withTree(text, (chunkRoot) => {
        if (!chunkRoot.hasError) return;
        const patched = patchWhole(chunkRoot, text);
        edits.push(...shifted(patched.edits, chunk.start));
        errors.push(...shifted(patched.errors, chunk.start));
      });
    }
    return edits.length ? { edits, errors } : undefined;
  };

  return (source) =>
    withTree(source, (root) => {
      if (!root.hasError) return { source, edits: [], errors: [] };
      const { edits, errors } =
        patchChunks(root, source) ?? patchWhole(root, source);
      const kept = outermost(edits);
      return { source: apply(source, kept), edits: kept, errors };
    });
};
