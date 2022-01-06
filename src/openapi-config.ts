export const openAPIOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Effekt Donation API',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        oAuth: {
          type: 'oauth2',
          scheme: 'bearer',
          flows: {
            authorizationCode: {
              authorizationUrl: '/auth/login/',
              tokenUrl: '/auth/token',
              scopes: {
                read_user_info: 'Read information about current user',
                read_all_donations: 'Read all donations',
                write_all_donations: 'Write all donations'
              }
            }
          }
        }
      }
    },
    security: [{
      oAuth: ['read_all_donations']
    }]
  },
  apis: ['src/routes/**/*.js', 'src/routes/**/*.ts', 'specs/**/*.yaml'],
}