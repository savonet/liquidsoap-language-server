import type { Position, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export const lineText = (document: TextDocument, line: number): string =>
  document
    .getText({
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    })
    .replace(/\r?\n$/, "");

const utf8Length = (codePoint: number): number =>
  codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

// Liquidsoap counts columns in UTF-8 bytes, the protocol in UTF-16 code units.
export const utf16Column = (text: string, byteColumn: number): number => {
  let bytes = 0;
  let units = 0;
  for (const char of text) {
    if (bytes >= byteColumn) break;
    const codePoint = char.codePointAt(0)!;
    bytes += utf8Length(codePoint);
    units += codePoint > 0xffff ? 2 : 1;
  }
  return units;
};

export const byteColumn = (text: string, utf16Column: number): number =>
  Buffer.byteLength(text.slice(0, utf16Column), "utf8");

// Liquidsoap lines start at 1, the protocol's at 0.
const toPosition = (
  document: TextDocument,
  line: number,
  byteColumn: number,
): Position => {
  const zeroBasedLine = Math.min(Math.max(line - 1, 0), document.lineCount - 1);
  return {
    line: zeroBasedLine,
    character: utf16Column(lineText(document, zeroBasedLine), byteColumn),
  };
};

export const toRange = (
  document: TextDocument,
  start: { line: number; column: number },
  end: { line: number; column: number },
): Range => ({
  start: toPosition(document, start.line, start.column),
  end: toPosition(document, end.line, end.column),
});
