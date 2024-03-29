import express from 'express';
import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';
import uuid from 'uuid/v4';
import readline from 'readline';
import amqp from 'amqplib/callback_api';
import multiparty from 'multiparty';
import * as https from 'https';

const environment = {
  defaultFilepath: '/share',
  clientResponseTimeout: 15000,

  snsTopicArn: 'arn:aws:sns:eu-west-1:560058809970:file-sharing',
  endpoint: process.env.IP,
  snsRegion: 'eu-west-1',

  rabbitMQUserName: 'admin',
  rabbitMQPassword: 'admin',
  rabbitMQHost: '34.226.140.241',
  rabbitMQPort: '5672',
  rabbitMQQueueName: 'Files'
};

const app: express.Application = express();

// Get environment variable
AWS.config.update({region: environment.snsRegion});
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
      owner: environment.endpoint
    }),
    TopicArn: environment.snsTopicArn
  };
  console.log('Try to confirm existence', params);
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
      owner: environment.endpoint
    }),
    TopicArn: environment.snsTopicArn
  };
  return sns.publish(params).promise();
}

/*// Listen all messages in SNS topic
async function subscribeForSNSMessages() {
  return new Promise<any>((resolve, reject) => {
    // Request subscription
    const params = {
      Protocol: 'http',
      TopicArn: environment.snsTopicArn,
      Endpoint: `http://${environment.endpoint}:3000/msg`
    };
    sns.subscribe(params, (err, data) => { if (err) reject(err); });
  });
}*/

// DEBUG
/*const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
rl.on('line', (line: string) => {
  rl.write(`Gotten string ${line}`);
  // TODO Handle errors
  let split = line.split(' ');
  switch(split[0]) {
    case 'download':
      console.log(`Try to download ${split[1]}\n`);
      const reqUUID = uuid();
      requestFile(split[1], reqUUID).then(() => {
        wantedFiles[reqUUID] = true;
        setTimeout(() => {
          if (wantedFiles[reqUUID]) {
            try {
              amqp.connect({
                  hostname: '34.226.140.241',
                  port: 5672,
                  username: 'admin',
                  password: 'admin'
                },
                function (error0: any, connection: any) {
                  if (error0) {
                    throw error0;
                  }
                  connection.createChannel(function (error1: any, channel: any) {
                    if (error1) {
                      throw error1;
                    }

                    let queue = environment.rabbitMQQueueName;
                    let msg = JSON.stringify({
                      filename: split[1],
                      ip: environment.endpoint,
                      uuid: reqUUID
                    });

                    channel.assertQueue(queue, {
                      durable: false
                    });
                    channel.sendToQueue(queue, Buffer.from(msg));

                    console.log("Sent to server %s", msg);
                  });
                });
            } catch (e) {
              console.error('failed to connect to RabbitMQ', e);
              return;
            }
            app.get('/', async function (req, res) {
              const reqBody = JSON.parse(req.body);
              if (reqBody.status) {
                const client = new ftp.Client();
                // TODO Think about port
                await client.connect(req.ip, 3000);
                const wrappedFilename = wrapFilename(split[1]);
                await client.downloadTo(fs.createWriteStream(wrappedFilename), wrappedFilename);
                wantedFiles[reqUUID] = false;
              }
            });
          }
        }, environment.clientResponseTimeout)
      });
      break;
    case 'set-ip':
      environment.endpoint = split[1];
      console.log(`IP is ${split[1]}\n`);
      break;
    case 'close':
      rl.close();
      break;
    default:
      console.log('Say what? I might have heard `' + line.trim() + '`');
      break;
  }
  rl.setPrompt('>');
  rl.prompt();
}).on('close', function() {
  console.log("\nBYE BYE !!!");
  process.exit(0);
});

rl.prompt();*/

// Start server
app.listen(3000, () => {
  console.log('App listening on port 3000!');
});

if (process.env.REQ === 'true') {
  console.log('Try to download test');
  const reqUUID = uuid();
  const filename = 'cat.jpg';

  try {
    amqp.connect({
        hostname: environment.rabbitMQHost,
        port: parseInt(environment.rabbitMQPort),
        username: environment.rabbitMQUserName,
        password: environment.rabbitMQPassword
      },
      function (error0: any, connection: any) {
        if (error0) {
          throw error0;
        }
        connection.createChannel(function (error1: any, channel: any) {
          if (error1) {
            throw error1;
          }

          let queue = environment.rabbitMQQueueName;
          let msg = JSON.stringify({
            filename: filename,
            ip: environment.endpoint,
            uuid: reqUUID
          });

          channel.assertQueue(queue, {
            durable: false
          });
          channel.sendToQueue(queue, Buffer.from(msg));

          console.log("Sent to server %s", msg);
        });
      });
  } catch (e) {
    console.error('failed to connect to RabbitMQ', e);
  }
  app.post('/', async function (req, res) {
    const reqBody = req.body;
    console.log("Handle server request", reqBody);
    console.log('Trying to connect to server via form data', req);
    let form = new multiparty.Form();
    form.parse(req, (err: any, fields: any, files: any) => {
      if (!err) {
        console.log('Fields is', fields);
        console.log('Files is', files);
      } else {
        console.error('Failed to parse request', err)
      }
    });
  });
}
