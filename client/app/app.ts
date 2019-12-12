import express from 'express';
import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';
import uuid from 'uuid/v4'
import readline from 'readline'
import ftp from 'basic-ftp';
import amqp from 'amqplib/callback_api';

import { environment } from '../environment/environment';

const app: express.Application = express();
AWS.config.update({region: environment.sns.region});
const sns = new AWS.SNS({});

// TODO Wrap with mutex
const wantedFiles: {[id: string]: boolean} = {};

// Check: if the file exists?
async function checkFileExistence(filename: string) {
  const filepath = wrapFilename(filename);
  // TODO fs.access?
  return fs.existsSync(filepath);
}

// Wrap filenames
function wrapFilename(filename: string) {
  return path.basename(`${environment.defaultFilepath}/${filename}`)
}

// Confirm existence of file
async function confirmExistence(filename: string, uuid: string) {
  let params = {
    Message: JSON.stringify({
      uuid: uuid,
      filename: filename,
      owner: environment.sns.endpoint
    }),
    TopicArn: environment.sns.topicArn
  };
  return sns.publish(params).promise();
}

// Read file content
async function readFile(filename: string) {
  const filepath = path.basename(`${environment.defaultFilepath}/${filename}`);
  return fs.readFileSync(filepath);
}

// Save file
async function saveFile(filename: string, content: any) {
  const filepath = path.basename(`${environment.defaultFilepath}/${filename}`);
  return fs.writeFileSync(filepath, content);
}

// Request file from other clients
async function requestFile(filename: string, uuid: string) {
  let params = {
    Message: JSON.stringify({
      uuid: uuid,
      filename: filename,
      isRequest: true,
      owner: environment.sns.endpoint
    }),
    TopicArn: environment.sns.topicArn
  };
  return sns.publish(params).promise();
}

// Listen all messages in SNS topic
async function subscribeForSNSMessages() {
  const params = {
    Protocol: 'http',
    TopicArn: environment.sns.topicArn,
    Endpoint: environment.sns.endpoint
  };
  return new Promise<any>((resolve, reject) => {
    sns.subscribe(params, function(err, data) {
      if (!err)
        resolve(data);
      else
        reject(err);
    });
  });
}

// Get file from another client
async function getFileFromClient(filename: string, sourceIp: string) {
  const client = new ftp.Client();
  // TODO Think about port
  await client.connect(sourceIp, 3000);
  const wrappedFilename = wrapFilename(filename);
  await client.downloadTo(fs.createWriteStream(wrappedFilename), wrappedFilename);
}

// Handle new msg
app.get('/msg', async function (req, res) {
  // DEBUG
  console.log(req);
  let requestBody = JSON.parse(req.body);
  if (requestBody.isRequest && await checkFileExistence(requestBody.filename)) {
    await confirmExistence(requestBody.filename, requestBody.uuid);
  }
  if (!requestBody.isRequest && wantedFiles[requestBody.uuid]) {
    await getFileFromClient(requestBody.filename, requestBody.owner);
    wantedFiles[requestBody.uuid] = false;
  }
});

// Listen requests
app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

subscribeForSNSMessages()
  .then((res: any) => console.log(res))
  .catch((e: any) => console.error(e));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
let isStopped = false;


rl.on("close", function() {
  isStopped = true;
  console.log("\nBYE BYE !!!");
  process.exit(0);
});

while (!isStopped) {
  rl.question('What the file do you looking for?', (filename: string) => {
    const reqUUID = uuid();
    requestFile(filename, reqUUID).then(() => {
      wantedFiles[reqUUID] = true;
      setTimeout(() => {
        if (wantedFiles[reqUUID]) {
          try {
            amqp.connect(`amqp://${environment.rabbitMQ.ip}:${environment.rabbitMQ.port}`,
              function (error0: any, connection: any) {
                if (error0) {
                  throw error0;
                }
                connection.createChannel(function (error1: any, channel: any) {
                  if (error1) {
                    throw error1;
                  }

                  let queue = environment.rabbitMQ.queueName;
                  let msg = filename;

                  channel.assertQueue(queue, {
                    durable: false
                  });
                  channel.sendToQueue(queue, Buffer.from(msg));

                  console.log(" [x] Sent %s", msg);
                });
              });
          } catch (e) {
            console.error('failed to connect to RabbitMQ', e);
            return;
          }
          // TODO Get file
          // TODO Save file
          wantedFiles[reqUUID] = false;
        }
      }, environment.clientResponseTimeout)
    })
  });
}
