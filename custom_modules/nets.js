const config = require('./../config')
const mail = require('./mail')
const SftpClient = require('ssh2-sftp-client')

/**
 * Fetches a list of all the OCR files
 */
async function getOCRFiles() {
    const connection = await getConnection()

    const files = await connection.list('/Outbound')

    await connection.end();
    return files;
}

/**
 * Fetches a file with a given name
 * @returns {Buffer} A buffer of the file contents
 */
async function getOCRFile(name) {
  const connection = await getConnection()
  const buffer = await connection.get(`/Outbound/${name}`)
  connection.end()

  await mail.sendOcrBackup(buffer)

  return buffer
}

/**
 * Fetches the latest OCR file as a buffer
 * @returns {Buffer} A buffer of the file contents
 */
async function getLatestOCRFile() {
  const connection = await getConnection()

  const files = await connection.list('/Outbound')

  if (files.length == 0)
    throw new Error("No files in SFTP directory")

  const sortedFiles = files.sort(file => file.modifyTime)

  const latest = sortedFiles[sortedFiles.length - 1]

  const buffer = await connection.get(`/Outbound/${latest.name}`)
  connection.end()

  await mail.sendOcrBackup(buffer)

  return buffer
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
    passphrase: config.nets_sftp_key_passphrase
  })

  return sftp
}

module.exports = {
  getOCRFiles,
  getOCRFile,
  getLatestOCRFile
}