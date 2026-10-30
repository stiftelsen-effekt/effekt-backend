import { getConnection } from "./sftp";

/**
 * Fetches a list of all the OCR files
 */
export async function getOCRFiles() {
  const connection = await getConnection();

  const files = await connection.list("/Outbound");

  await connection.end();
  return files;
}

/**
 * Fetches a file with a given name
 * @returns {Buffer} A buffer of the file contents
 */
export async function getOCRFile(name) {
  const connection = await getConnection();
  const buffer = await connection.get(`/Outbound/${name}`);
  connection.end();

  return buffer;
}

/**
 * Fetches the latest OCR file as a buffer
 * @returns {Buffer} A buffer of the file contents
 */
export async function getLatestOCRFile() {
  const connection = await getConnection();

  const files = await connection.list("/Outbound");

  if (files.length == 0) return null;

  const sortedFiles = files.sort((file) => file.modifyTime);

  const latest = sortedFiles[sortedFiles.length - 1];

  const buffer = await connection.get(`/Outbound/${latest.name}`);
  connection.end();

  return buffer;
}

/**
 * Fetches the latest Avtalegiro reciept file as a buffer
 * @param {number} shipmentID A shipment ID to check for accepted reciepts
 * @returns {Boolean} True or false
 */
export async function checkIfAcceptedReciept(shipmentID: number) {
  const connection = await getConnection();

  const files = await connection.list("/Inbound");
  connection.end();

  if (files.length == 0) return false;

  let paddedShipmentID = shipmentID.toString().padStart(7, "0");

  const filteredFiles = files.filter(
    (file) => file.name.match(`KV\.GODKJENT\.F${paddedShipmentID}`) !== null,
  );

  if (filteredFiles.length == 0) return false;
  else return true;
}

/**
 *
 * @param {Buffer} file
 * @param {string} filename
 * @returns {Buffer} A buffer of the file contents
 */
export async function sendFile(file, filename) {
  const connection = await getConnection();
  await connection.put(file, `/Inbound/${filename}`);
  connection.end();

  return file;
}
