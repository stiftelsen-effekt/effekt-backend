import React, { useMemo, useState } from "react";
import { Eye } from "react-feather";
import katex from "katex";
import { BlockDecoratorProps } from "sanity";
import "katex/dist/katex.min.css";

export const MathRenderer = (props: BlockDecoratorProps) => {
  const [showPreview, setShowPreview] = useState(false);

  /* Get the text content of the children */
  const text = props?.children?.props.text.text;

  const html = useMemo(() => {
    if (text === undefined) return "";
    try {
      return katex.renderToString(text, { throwOnError: false });
    } catch (e) {
      // nosemgrep: javascript.lang.security.html-in-template-string.html-in-template-string -- KaTeX error for LaTeX that staff wrote in Sanity
      return `<span class="katex-error">${(e as Error).message}</span>`;
    }
  }, [text]);

  if (!props || !props.children) {
    return null;
  }

  return (
    <span style={{ display: "inline-block", position: "relative", fontFamily: "monospace" }}>
      {props.children}
      <Eye
        size={14}
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
        style={{
          padding: "0.25rem",
          margin: "0 0.1rem",
          verticalAlign: "text-bottom",
          cursor: "context-menu",
        }}
      />
      {/* A rendered preview */}
      <span
        style={{
          display: showPreview ? "block" : "none",
          padding: "0.25rem 0.5rem",
          border: "1px solid #ccc",
          position: "absolute",
          top: "-100%",
          right: "0",
          backgroundColor: "#fff",
          zIndex: "1000",
          transform: "translateX(calc(100% + 0.25rem)) translateY(50%)",
          whiteSpace: "nowrap",
        }}
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- KaTeX output for LaTeX that staff wrote in Sanity
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </span>
  );
};
