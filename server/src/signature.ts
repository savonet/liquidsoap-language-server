import type { Patcher } from "liquidsoap-patcher";
import {
  ParameterInformation,
  Position,
  SignatureHelp,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Analysis } from "./analysis";
import { checkAt } from "./checked";
import type { Argument, Docs } from "./docs";

/** The call the cursor is in: its function's name, and the arguments so far. */
export interface Call {
  name: string;
  /** The arguments before the cursor, the last one being the one written. */
  arguments: string[];
}

const closing: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const calledName = /([\p{L}_][\p{L}\p{N}_'.]*)\s*$/u;

// The call being typed does not parse yet, so it is found in the text: the
// innermost bracket still open at the cursor, skipping strings and comments.
export const callAt = (text: string, offset: number): Call | undefined => {
  const open: { bracket: string; at: number; argumentStarts: number[] }[] = [];
  for (let i = 0; i < offset; i++) {
    const char = text[i];
    if (char === "#") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? offset : end;
    } else if (char === '"' || char === "'") {
      for (i++; i < offset && text[i] !== char; i++) if (text[i] === "\\") i++;
    } else if (char === "(" || char === "[" || char === "{")
      open.push({ bracket: char, at: i, argumentStarts: [i + 1] });
    else if (closing[char]) {
      if (open.at(-1)?.bracket === closing[char]) open.pop();
    } else if (char === ",") open.at(-1)?.argumentStarts.push(i + 1);
  }
  const call = open.at(-1);
  if (call?.bracket !== "(") return undefined;
  const name = calledName.exec(text.slice(0, call.at))?.[1];
  if (!name) return undefined;
  const ends = [...call.argumentStarts.slice(1).map((start) => start - 1), offset];
  return {
    name,
    arguments: call.argumentStarts.map((start, i) => text.slice(start, ends[i])),
  };
};

const labelled = /^\s*([\p{L}_][\p{L}\p{N}_']*)\s*=(?!=)/u;

// A type's constraints follow it on lines of their own, too long for a signature.
const parameterLabel = ({ label, type, default: value }: Argument): string => {
  const shortType = type.split("\nwhere ")[0];
  return label ? `${value === null ? "" : "?"}${label} : ${shortType}` : shortType;
};

// A labelled argument names its parameter; an unlabelled one is the next
// unlabelled parameter.
const activeParameter = (parameters: Argument[], call: Call): number | undefined => {
  const written = call.arguments.at(-1) ?? "";
  const label = labelled.exec(written)?.[1];
  if (label !== undefined) {
    const index = parameters.findIndex((parameter) => parameter.label === label);
    return index === -1 ? undefined : index;
  }
  const positionalBefore = call.arguments
    .slice(0, -1)
    .filter((argument) => !labelled.test(argument) && argument.trim() !== "").length;
  const positional = parameters
    .map((parameter, index) => ({ parameter, index }))
    .filter(({ parameter }) => parameter.label === "");
  return positional[positionalBefore]?.index;
};

export const signatureHelp = (
  analysis: Analysis,
  patch: Patcher,
  docs: Docs,
  document: TextDocument,
  position: Position,
): SignatureHelp | null => {
  const offset = document.offsetAt(position);
  const call = callAt(document.getText(), offset);
  const doc = call && docs.get(call.name);
  if (!call || !doc) return null;
  // As on hover, a name the script binds is not the standard library's.
  const root = call.name.split(".")[0];
  const checked = checkAt(analysis, patch, document, offset);
  if (checked && analysis.localsAt(checked.at.line, checked.at.column).includes(root))
    return null;
  let label = `${call.name}(`;
  const parameters: ParameterInformation[] = doc.arguments.map((argument, index) => {
    if (index > 0) label += ", ";
    const start = label.length;
    label += parameterLabel(argument);
    const description = [
      argument.description,
      argument.default === null ? "" : `Defaults to \`${argument.default}\`.`,
    ]
      .filter(Boolean)
      .join(" ");
    return { label: [start, label.length], documentation: description || undefined };
  });
  label += ")";
  return {
    signatures: [{ label, documentation: doc.description, parameters }],
    activeSignature: 0,
    activeParameter: activeParameter(doc.arguments, call) ?? null,
  };
};
