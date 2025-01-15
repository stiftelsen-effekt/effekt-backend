import * as config from "./../config";
import SftpClient from "ssh2-sftp-client";

export async function getConnection() {
  const sftp = new SftpClient();

  await sftp.connect({
    host: config.nets_sftp_server,
    port: 10026,
    username: config.nets_sftp_user,
    privateKey: config.nets_sftp_key,
    passphrase: config.nets_sftp_key_passphrase,
  });

  return sftp;
}
