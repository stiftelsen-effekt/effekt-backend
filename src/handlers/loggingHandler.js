const morgan = require("morgan");
const chalk = require("chalk");
const process = require("process");

module.exports = function (app) {
  let mode = "dev";
  if (process.env.NODE_ENV === "production") {
    mode = "short";
  }

  app.use(morgan(mode));
};

function padRight(str, len) {
  return len > str.length ? str + new Array(len - str.length + 1).join(" ") : str;
}
