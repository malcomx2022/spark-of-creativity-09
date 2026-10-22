// Campagne FedaPay (document 09) : hors des tests e2e, lancée à la demande (npm run campaign:fedapay).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/campaign/**/*.campaign.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 600000,
};
