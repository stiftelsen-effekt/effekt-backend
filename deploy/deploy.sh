#!/bin/bash
# Deployment-skript som kjøres av Travis etter suksessfull build av production-branchen

# find . -not -name "node_modules/" -exec curl -k --ftp-create-dirs -T {} -u $FTP_USER:$FTP_PASSWORD sftp://api.gieffektivt.no/var/www/api \;

sftp -b ./deploy/sftp_batch.txt gieffektivt@api.gieffektivt.no
