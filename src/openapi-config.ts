export const openAPIOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Effekt Donation API',
      version: '1.0.0',
    },
  },
  apis: ['src/routes/**/*.js', 'src/routes/**/*.ts', 'src/specs/**/*.yaml'],
}