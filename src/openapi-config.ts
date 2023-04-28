export const openAPIOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Effekt Donation API",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        auth0_jwt: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl:
                "https://gieffektivt.eu.auth0.com/authorize?audience=https://data.gieffektivt.no",
              // authorizationUrl: "https://gieffektivt.eu.auth0.com/authorize?audience=https://data.gieffektivt.no&organization=org_C22zuodLcKhU4O5V",
              tokenUrl: "https://gieffektivt.eu.auth0.com/oauth/token",
              scopes: {
                "read:donations": "read donations",
                "read:profile": "read profile info",
                "write:profile": "mutate profile",
                "read:agreements": "read recurruing agreements",
                "write:agreements": "mutate recurruing agreements",
              },
            },
          },
          // audience: "https://data.gieffektivt.no"
        },
      },
    },
  },
  apis: ["src/routes/**/*.js", "src/routes/**/*.ts", "src/specs/**/*.yaml"],
};

export const swaggerOptions = {
  swaggerOptions: {
    oauth: {
      clientId: "RDDsHyDQ4ZJhmjghalj6Ib1e1sD035jN",
    },
  },
};
