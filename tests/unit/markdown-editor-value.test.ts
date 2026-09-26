import { describe, expect, it } from "vitest";
import { normalizeMarkdownEditorValue } from "../../src/lib/markdown-editor-value";

describe("normalizeMarkdownEditorValue", () => {
  it("removes Vditor's synthetic trailing line break", () => {
    expect(normalizeMarkdownEditorValue("The light is broken.\n"))
      .toBe("The light is broken.");
    expect(normalizeMarkdownEditorValue("\n")).toBe("");
  });

  it("normalizes CRLF while preserving user-authored trailing structure", () => {
    expect(normalizeMarkdownEditorValue("first\r\nsecond\r\n"))
      .toBe("first\nsecond");
    expect(normalizeMarkdownEditorValue("first\n\n"))
      .toBe("first\n");
  });

  it("leaves values without a synthetic terminator unchanged", () => {
    expect(normalizeMarkdownEditorValue("first\nsecond"))
      .toBe("first\nsecond");
    expect(normalizeMarkdownEditorValue("")).toBe("");
  });
});
