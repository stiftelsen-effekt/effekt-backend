import * as config from "./../config";
import SftpClient from "ssh2-sftp-client";

export async function getConnection() {
  const sftp = new SftpClient();

  await sftp.connect({
    host: config.giro_sftp_server,
    port: 10026,
    username: config.giro_sftp_user,
    privateKey: config.giro_sftp_key,
    passphrase: config.giro_sftp_key_passphrase,
  });

  return sftp;
}
