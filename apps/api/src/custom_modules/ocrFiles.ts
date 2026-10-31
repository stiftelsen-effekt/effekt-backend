export type OCRFileInfo = { name: string; modifyTime: number };
export type OCRFile = OCRFileInfo & { contents: Buffer };

/** What has already been imported, as recorded in the OCR import logs. */
export type OCRImportState = {
  /** `${name}@${modifyTime}` of every imported file */
  imported: Set<string>;
  /** modifyTime of the first file imported since files were recorded, or null if none was */
  trackedSince: number | null;
};

export const ocrFileKey = (file: OCRFileInfo) => `${file.name}@${file.modifyTime}`;

/**
 * Picks the OCR files to import, oldest first: every file not imported yet that is no older than
 * the first recorded import. Until a file has been recorded, only the latest file is imported,
 * as before files were recorded, so the files already on the server are not imported again.
 */
export function selectOCRFilesToImport(files: OCRFileInfo[], state: OCRImportState): OCRFileInfo[] {
  const sorted = [...files].sort((a, b) => a.modifyTime - b.modifyTime);
  if (sorted.length === 0) return [];
  const trackedSince = state.trackedSince;
  if (trackedSince === null) return [sorted[sorted.length - 1]];

  return sorted.filter(
    (file) => file.modifyTime >= trackedSince && !state.imported.has(ocrFileKey(file)),
  );
}
