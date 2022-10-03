module.exports = {
  extensions: ['ts'],
  // environmentVariables: {
  //   DEBUG: 'integreat:transporter:http',
  // },
  require: ['ts-node/register/transpile-only'],
  files: ['src/**/*.test.ts'],
}
