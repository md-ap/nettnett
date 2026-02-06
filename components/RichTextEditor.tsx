"use client";

import { useRef, useCallback, useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function ToolbarButton({
  label,
  onClick,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      className={`rounded px-2 py-1 text-xs transition-colors ${
        active
          ? "bg-white/20 text-white"
          : "text-white/60 hover:bg-white/10 hover:text-white"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
      title={label}
    >
      {label}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something...",
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Track whether the last change was from user input (internal)
  // to avoid re-rendering innerHTML and losing cursor position
  const isInternalChange = useRef(false);

  // Sync value prop to editor only on external changes
  // (initial load, form reset, edit modal open — NOT during typing)
  useEffect(() => {
    if (isInternalChange.current) {
      // This change came from user typing — skip innerHTML update
      isInternalChange.current = false;
      return;
    }
    // External change — safely update innerHTML
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      isInternalChange.current = true;
      onChange(html === "<br>" ? "" : html);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  const addLink = useCallback(() => {
    const url = prompt("Enter URL:");
    if (url) {
      exec("createLink", url);
    }
  }, [exec]);

  const isEmpty = !value || value === "<br>" || value === "<div><br></div>";

  return (
    <div className={`rounded border border-white/20 overflow-hidden ${disabled ? "opacity-50" : ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-white/[0.03] px-2 py-1.5">
        <ToolbarButton label="B" onClick={() => exec("bold")} disabled={disabled} />
        <ToolbarButton label="I" onClick={() => exec("italic")} disabled={disabled} />
        <ToolbarButton label="U" onClick={() => exec("underline")} disabled={disabled} />
        <div className="mx-1 h-4 w-px bg-white/10" />
        <ToolbarButton label="H1" onClick={() => exec("formatBlock", "h3")} disabled={disabled} />
        <ToolbarButton label="H2" onClick={() => exec("formatBlock", "h4")} disabled={disabled} />
        <ToolbarButton label="P" onClick={() => exec("formatBlock", "p")} disabled={disabled} />
        <div className="mx-1 h-4 w-px bg-white/10" />
        <ToolbarButton label="&bull; List" onClick={() => exec("insertUnorderedList")} disabled={disabled} />
        <ToolbarButton label="1. List" onClick={() => exec("insertOrderedList")} disabled={disabled} />
        <div className="mx-1 h-4 w-px bg-white/10" />
        <ToolbarButton label="Link" onClick={addLink} disabled={disabled} />
        <ToolbarButton label="Clear" onClick={() => exec("removeFormat")} disabled={disabled} />
      </div>

      {/* Editor */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onPaste={handlePaste}
          className="min-h-[100px] px-4 py-3 text-sm text-white outline-none bg-white/5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:my-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:my-1 [&_a]:text-blue-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1"
          suppressContentEditableWarning
        />
        {isEmpty && !disabled && (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-white/30">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
