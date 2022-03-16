export const openAPIOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Effekt Donation API',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        auth0_jwt: {
          type: "oauth2",
          "flows": {
            "authorizationCode": {
              "authorizationUrl": "https://konduit.eu.auth0.com/authorize?audience=https://data.gieffektivt.no",
              "tokenUrl": "https://konduit.eu.auth0.com/oauth/token",
              "scopes": {
                "read:donations": "read donations",
                "read:profile": "read profile info",
                "write:profile": "mutate profile"
              }
            }
          }
          // audience: "https://data.gieffektivt.no"
        }
      }
    }
  },
  apis: ['src/routes/**/*.js', 'src/routes/**/*.ts', 'src/specs/**/*.yaml'],
}

export const swaggerOptions = {
  swaggerOptions: {
    oauth: {
       clientId: "fsYC8FIVfxACIJjSr5ZQtZZ2AHBAApDL",
    },
 },
}