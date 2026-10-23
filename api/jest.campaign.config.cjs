// Campagnes FedaPay (document 09) et Akambi (docs/academy/02) : hors des tests e2e, lancées à la demande
// (npm run campaign:fedapay, npm run campaign:akambi).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/campaign/**/*.campaign.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 600000,
};
