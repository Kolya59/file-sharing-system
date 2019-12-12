export const environment = {
  defaultFilepath: '/share',
  // TODO Set public IP
  clientResponseTimeout: 15000,

  sns: {
    topicArn: 'arn:aws:sns:eu-west-1:560058809970:file-sharing',
    endpoint: 'http://127.0.0.1:3000/msg',
    region: 'eu-west-1',
  },
  rabbitMQ: {
    username: 'admin',
    password: 'admin',
    ip: '34.226.140.241',
    port: '5672',
    queueName: 'Files'
  }
};
