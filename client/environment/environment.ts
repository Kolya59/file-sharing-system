export const environment = {
  defaultFilepath: '/share',
  // TODO Set public IP
  clientResponseTimeout: 15000,

  snsTopicArn: 'arn:aws:sns:eu-west-1:560058809970:file-sharing',
  endpoint: 'http://127.0.0.1:3000/msg',
  snsRegion: 'eu-west-1',

  rabbitMQUserName: 'admin',
  rabbitMQPassword: 'admin',
  rabbitMQHost: '34.226.140.241',
  rabbitMQPort: '5672',
  rabbitMQQueueName: 'Files'
};
