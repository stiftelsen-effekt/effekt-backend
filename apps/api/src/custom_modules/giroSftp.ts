/**
 * Files exchanged with Mastercard Payment Services (formerly Nets) over SFTP: OCR Giro files are
 * read from /Outbound, AvtaleGiro claim files are put in /Inbound, where their receipts appear.
 */
import { getConnection } from "./sftp";
import type { OCRFile, OCRFileInfo } from "./ocrFiles";

/**
 * Closes an SFTP connection without throwing: by then the work is done, and failing the caller
 * (for instance after a claims file was sent) would invite a retry that repeats it.
 */
async function closeQuietly(connection: { end: () => Promise<unknown> }) {
  try {
    await connection.end();
  } catch (ex) {
    console.error("Failed to close SFTP connection", ex);
  }
}

/**
 * Fetches the OCR files in /Outbound that `select` picks from the listing
 * @returns The selected files with their contents, in the order `select` returned them
 */
export async function getOCRFiles(
  select: (files: OCRFileInfo[]) => OCRFileInfo[],
): Promise<OCRFile[]> {
  const connection = await getConnection();
  try {
    const listing = await connection.list("/Outbound");
    const files = listing
      .filter((file) => file.type !== "d")
      .map((file) => ({ name: file.name, modifyTime: file.modifyTime }));

    const result: OCRFile[] = [];
    for (const file of select(files)) {
      const contents = (await connection.get(`/Outbound/${file.name}`)) as Buffer;
      result.push({ ...file, contents });
    }
    return result;
  } finally {
    await closeQuietly(connection);
  }
}

/**
 * Fetches the latest Avtalegiro reciept file as a buffer
 * @param {number} shipmentID A shipment ID to check for accepted reciepts
 * @returns {Boolean} True or false
 */
export async function checkIfAcceptedReciept(shipmentID: number) {
  const connection = await getConnection();

  let files;
  try {
    files = await connection.list("/Inbound");
  } finally {
    await closeQuietly(connection);
  }

  if (files.length == 0) return false;

  let paddedShipmentID = shipmentID.toString().padStart(7, "0");

  const filteredFiles = files.filter(
    (file) => file.name.match(`KV\.GODKJENT\.F${paddedShipmentID}`) !== null,
  );

  if (filteredFiles.length == 0) return false;
  else return true;
}

/**
 * Lists the file names in the SFTP /Inbound folder, where MPS puts receipts for the files we send
 * (see avtalegiro/receipts.ts for how they are named)
 */
export async function listInboundFileNames(): Promise<string[]> {
  const connection = await getConnection();
  try {
    const files = await connection.list("/Inbound");
    return files.map((file) => file.name);
  } finally {
    await closeQuietly(connection);
  }
}

/**
 *
 * @param {Buffer} file
 * @param {string} filename
 * @returns {Buffer} A buffer of the file contents
 */
export async function sendFile(file, filename) {
  const connection = await getConnection();
  try {
    await connection.put(file, `/Inbound/${filename}`);
  } finally {
    await closeQuietly(connection);
  }

  return file;
}
