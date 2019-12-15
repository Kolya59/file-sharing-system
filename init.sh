#!/bin/bash

curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install

mkdir ~/home/.aws
touch credentials
echo "[default]
aws_access_key_id = AKIAYEZQ3HZZK2GKMYMD
aws_secret_access_key = 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" > credentials
