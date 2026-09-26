export function normalizeMarkdownEditorValue(value: string) {
  const normalizedLineEndings = value.replace(/\r\n?/gu, "\n");
  return normalizedLineEndings.endsWith("\n")
    ? normalizedLineEndings.slice(0, -1)
    : normalizedLineEndings;
}
