#!/bin/bash
# Deployment-skript som kjøres av Travis etter suksessfull build av production-branchen

find . -exec curl --ftp-create-dirs -T {} -u $FTP_USER:$FTP_PASSWORD sftp://api.gieffektivt.no/var/www/api -k
