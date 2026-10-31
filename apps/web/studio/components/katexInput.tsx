import React, { useState } from "react";
import { TextInput, Card, Stack } from "@sanity/ui";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ObjectInputProps, set } from "sanity";

const KatexInput = (props: ObjectInputProps) => {
  const { value, onChange, readOnly } = props;
  const [input, setInput] = useState(value?.latex || "");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInput(newValue);

    let renderedHtml = "";
    try {
      renderedHtml = katex.renderToString(newValue, { throwOnError: false });
    } catch {
      renderedHtml = `<span class="katex-error">Invalid LaTeX expression</span>`;
    }

    onChange(
      set({
        _key: value?._key,
        _type: value?._type,
        latex: newValue,
        renderedHtml: renderedHtml,
      }),
    );
  };

  return (
    <Stack gap={3}>
      <TextInput
        value={input}
        onChange={handleChange}
        placeholder="Enter LaTeX code"
        readOnly={readOnly}
      />
      <Card tone="transparent" padding={4} shadow={1}>
        <div
          // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- KaTeX output, previewing LaTeX the signed-in editor is typing
          dangerouslySetInnerHTML={{ __html: katex.renderToString(input, { throwOnError: false }) }}
        />
      </Card>
    </Stack>
  );
};

export default KatexInput;
