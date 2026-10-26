import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { useId, useState, type DragEvent } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type FileDropzoneProps = {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
  hint?: string;
  className?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, { decimals: 1 })} KB`;
  return `${formatNumber(bytes / 1024 / 1024, { decimals: 1 })} MB`;
}

export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  files,
  onFilesChange,
  label = "Drop file here or click to browse",
  hint,
  className,
}: FileDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const list = Array.from(incoming);
    onFilesChange(multiple ? [...files, ...list] : list.slice(0, 1));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(event.dataTransfer.files);
  }

  return (
    <div className={cn("grid gap-2", className)} data-slot="file-dropzone">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        data-disabled={disabled || undefined}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 border border-dashed border-border-strong bg-muted px-4 py-6 text-center transition-colors",
          "hover:border-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
          "data-[dragging]:border-foreground data-[dragging]:bg-pressed",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        )}
      >
        <UploadIcon className="size-5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="grid gap-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 border border-border px-2.5 py-1.5 text-sm"
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="num text-xs text-muted-foreground">{formatSize(file.size)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
