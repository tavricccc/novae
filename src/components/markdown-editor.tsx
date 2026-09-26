"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useI18n } from "@/i18n";
import { getVditorI18n } from "@/lib/vditor-i18n";
import { cn } from "@/lib/utils";
import "vditor/dist/index.css";
import "@/styles/vditor-editor.css";

type VditorInstance = InstanceType<typeof import("vditor").default>;
const vditorCdn = "https://unpkg.com/vditor@4.0.0";

function findEditable(root: HTMLElement) {
  return root.querySelector<HTMLElement>('[class~="vditor-wysiwyg"] > [contenteditable="true"]');
}

function decorateEditable(
  root: HTMLElement,
  id: string,
  ariaLabel: string,
  ariaDescribedBy: string,
) {
  const editable = findEditable(root);
  if (!editable) return;
  editable.id = id;
  editable.setAttribute("aria-label", ariaLabel);
  editable.setAttribute("aria-multiline", "true");
  editable.setAttribute("role", "textbox");
  editable.setAttribute("spellcheck", "true");
  if (ariaDescribedBy) editable.setAttribute("aria-describedby", ariaDescribedBy);
}

export function MarkdownEditor({
  ariaDescribedBy = "",
  ariaLabel,
  className,
  content,
  id,
  maxLength,
  onChange,
  onPickImages,
  placeholder,
}: {
  ariaDescribedBy?: string;
  ariaLabel: string;
  className?: string;
  content: string;
  id: string;
  maxLength: number;
  onChange: (value: string) => void;
  onPickImages?: (files: FileList | null) => void;
  placeholder: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const editorRef = React.useRef<VditorInstance | null>(null);
  const contentRef = React.useRef(content);
  const onChangeRef = React.useRef(onChange);
  const onPickImagesRef = React.useRef(onPickImages);
  const maxLengthRef = React.useRef(maxLength);
  const isComposingRef = React.useRef(false);
  const [ready, setReady] = React.useState(false);
  const { locale, t } = useI18n();
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    contentRef.current = content;
    onChangeRef.current = onChange;
    onPickImagesRef.current = onPickImages;
    maxLengthRef.current = maxLength;
  }, [content, maxLength, onChange, onPickImages]);

  const limitValue = React.useCallback((value: string, editor?: VditorInstance | null) => {
    const limited = value.slice(0, maxLengthRef.current);
    if (limited !== value && !isComposingRef.current) {
      editor?.setValue(limited);
    }
    onChangeRef.current(limited);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let createdEditor: VditorInstance | null = null;
    const container = containerRef.current;
    if (!container) return;

    const decorate = () => {
      decorateEditable(container, id, ariaLabel, ariaDescribedBy);
    };
    const editableObserver = new MutationObserver(decorate);
    editableObserver.observe(container, {
      attributes: true,
      attributeFilter: ["contenteditable"],
      childList: true,
      subtree: true,
    });
    decorate();

    setReady(false);
    void import("vditor").then(({ default: Vditor }) => {
      if (cancelled) return;

      const initialValue = contentRef.current.slice(0, maxLengthRef.current);
      createdEditor = new Vditor(container, {
        after: () => {
          if (cancelled || !createdEditor) return;
          editorRef.current = createdEditor;
          decorate();
          setReady(true);
        },
        cache: { enable: false },
        cdn: vditorCdn,
        height: "auto",
        hint: { emoji: {}, emojiPath: "", parse: false },
        i18n: getVditorI18n(t),
        input: (value) => {
          limitValue(value, createdEditor);
        },
        lang: locale === "en" ? "en_US" : "zh_TW",
        link: { isOpen: false },
        minHeight: 208,
        mode: "wysiwyg",
        icon: "ant",
        placeholder,
        preview: {
          hljs: { enable: false },
          markdown: {
            callout: false,
            codeBlockPreview: true,
            footnotes: false,
            mathBlockPreview: false,
            sanitize: true,
          },
          mode: "editor",
          theme: { current: "light", path: "" },
        },
        toolbar: [
          "headings",
          "bold",
          "italic",
          "list",
          "link",
          {
            name: "more",
            toolbar: [
              "ordered-list",
              "check",
              "quote",
              "inline-code",
              "code",
              "table",
            ],
          },
        ],
        toolbarConfig: { pin: false },
        upload: { url: "" },
        value: initialValue,
      });

      if (cancelled) {
        createdEditor.destroy();
        createdEditor = null;
        return;
      }

    });

    return () => {
      cancelled = true;
      editableObserver.disconnect();
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      } else if (createdEditor) {
        createdEditor.destroy();
        createdEditor = null;
      }
    };
  }, [ariaDescribedBy, ariaLabel, id, locale, limitValue, placeholder, t]);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !resolvedTheme) return;
    editor.setTheme(resolvedTheme === "dark" ? "dark" : "classic");
  }, [ready, resolvedTheme]);

  React.useEffect(() => {
    const editor = editorRef.current;
    const nextValue = content.slice(0, maxLength);
    if (editor && editor.getValue() !== nextValue) editor.setValue(nextValue);
  }, [content, maxLength, ready]);

  const handleCompositionStart = React.useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = React.useCallback(() => {
    isComposingRef.current = false;
    const editor = editorRef.current;
    if (editor) limitValue(editor.getValue(), editor);
  }, [limitValue]);

  const flushValue = React.useCallback(() => {
    const editor = editorRef.current;
    if (editor) onChangeRef.current(editor.getValue().slice(0, maxLengthRef.current));
  }, []);

  React.useEffect(() => {
    // Vditor debounces input callbacks. Save the latest DOM value before a
    // reload, rather than losing the user's last keystrokes to that delay.
    window.addEventListener("pagehide", flushValue);
    return () => window.removeEventListener("pagehide", flushValue);
  }, [flushValue]);

  const handleImageTransfer = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>) => {
      const files = "clipboardData" in event
        ? event.clipboardData.files
        : event.dataTransfer.files;
      if (!files.length || !onPickImagesRef.current) return;
      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length !== files.length) return;
      event.preventDefault();
      event.stopPropagation();
      onPickImagesRef.current(files);
    },
    [],
  );

  return (
    <div
      aria-busy={!ready}
      className={cn("novae-markdown-editor", !ready && "is-loading", className)}
      onBlurCapture={flushValue}
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={handleCompositionStart}
      onDropCapture={handleImageTransfer}
      onPasteCapture={handleImageTransfer}
    >
      <div ref={containerRef} />
      {!ready ? <span className="sr-only">{t("markdown.editorLoading")}</span> : null}
    </div>
  );
}
