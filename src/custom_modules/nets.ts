import * as config from "./../config";
import { sendOcrBackup } from "./mail";
const SftpClient = require("ssh2-sftp-client");

/**
 * Fetches a list of all the OCR files
 */
async function getOCRFiles() {
  const connection = await getConnection();

  const files = await connection.list("/Outbound");

  await connection.end();
  return files;
}

/**
 * Fetches a file with a given name
 * @returns {Buffer} A buffer of the file contents
 */
async function getOCRFile(name) {
  const connection = await getConnection();
  const buffer = await connection.get(`/Outbound/${name}`);
  connection.end();

  await sendOcrBackup(buffer);

  return buffer;
}

/**
 * Fetches the latest OCR file as a buffer
 * @returns {Buffer} A buffer of the file contents
 */
async function getLatestOCRFile() {
  const connection = await getConnection();

  const files = await connection.list("/Outbound");

  if (files.length == 0) return null;

  const sortedFiles = files.sort((file) => file.modifyTime);

  const latest = sortedFiles[sortedFiles.length - 1];

  const buffer = await connection.get(`/Outbound/${latest.name}`);
  connection.end();

  await sendOcrBackup(buffer);

  return buffer;
}

/**
 * Fetches the latest Avtalegiro reciept file as a buffer
 * @param {String} dateString A date string on the format yyLLdd.yyLLdd e.g. 210131.210205. First date is the date of the shipment, second is the due dates for the claims in the shipment
 * @returns {Boolean} True or false
 */
async function checkIfAcceptedReciept(dateString) {
  const connection = await getConnection();

  const files = await connection.list("/Inbound");
  connection.end();

  if (files.length == 0) return false;

  const filteredFiles = files.filter(
    (file) => file.name.match(`KV\.GODKJENT.*D${dateString}`) !== null
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
async function sendFile(file, filename) {
  const connection = await getConnection();
  await connection.put(file, `/Inbound/${filename}`);
  connection.end();

  return file;
}

/**
 * @private
 */
async function getConnection() {
  const sftp = new SftpClient();

  await sftp.connect({
    host: config.nets_sftp_server,
    port: 22,
    username: config.nets_sftp_user,
    privateKey: config.nets_sftp_key,
    passphrase: config.nets_sftp_key_passphrase,
  });

  return sftp;
}

module.exports = {
  getOCRFiles,
  getOCRFile,
  getLatestOCRFile,
  checkIfAcceptedReciept,
  sendFile,
};
