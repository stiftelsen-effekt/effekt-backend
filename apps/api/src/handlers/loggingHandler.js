const morgan = require("morgan");
const process = require("process");

module.exports = function (app) {
  let mode = "dev";
  if (process.env.NODE_ENV === "production") {
    mode = "short";
  }

  app.use(morgan(mode));
};
