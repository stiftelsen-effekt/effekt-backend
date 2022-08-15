import { tax } from "./DAO_modules/tax";
import { donors } from "./DAO_modules/donors";
import { donations } from "./DAO_modules/donations";
import { distributions } from "./DAO_modules/distributions";
import { vipps } from "./DAO_modules/vipps";
import { facebook } from "./DAO_modules/facebook";

const config = require("../config");
const mysql = require("mysql2/promise");

export const DAO = {
  //Submodules
  donors: donors,
  organizations: require("./DAO_modules/organizations"),
  donations: donations,
  distributions: distributions,
  payment: require("./DAO_modules/payment"),
  vipps: vipps,
  parsing: require("./DAO_modules/parsing"),
  referrals: require("./DAO_modules/referrals"),
  meta: require("./DAO_modules/meta"),
  initialpaymentmethod: require("./DAO_modules/initialpaymentmethod"),
  avtalegiroagreements: require("./DAO_modules/avtalegiroagreements"),
  facebook: facebook,
  tax: tax,
  logging: require("./DAO_modules/logging"),

  /**
   * Sets up a connection to the database, uses config.js file for parameters
   * @param {function} cb Callback for when DAO has been sucessfully set up
   */
  connect: async function (cb) {
    const dbSocketPath = process.env.DB_SOCKET_PATH || "/cloudsql";

    if (process.env.K_SERVICE != null) {
      // Running in google cloud
      var dbPool = await mysql.createPool({
        user: config.db_username,
        password: config.db_password,
        database: config.db_name,
        socketPath: `${dbSocketPath}/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
        enableKeepAlive: true,
      });
    } else {
      // Running locally
      var dbPool = await mysql.createPool({
        user: config.db_username,
        password: config.db_password,
        database: config.db_name,
        host: "127.0.0.1",
        enableKeepAlive: true,
      });
    }

    //Check whether connection was successfull
    //Weirdly, this is the proposed way to do it
    try {
      await dbPool.query("SELECT 1 + 1 AS Solution");
      console.log("Connected to database | Using database " + config.db_name);
    } catch (ex) {
      console.error(
        "Connection to database failed! | Using database " + config.db_name
      );
      console.log(ex);
      process.exit();
    }

    //Setup submodules
    DAO.donors.setup(dbPool);
    DAO.organizations.setup(dbPool);
    DAO.donations.setup(dbPool, this);
    DAO.distributions.setup(dbPool, this);
    DAO.payment.setup(dbPool);
    DAO.vipps.setup(dbPool);
    DAO.parsing.setup(dbPool);
    DAO.referrals.setup(dbPool);
    DAO.meta.setup(dbPool);
    DAO.initialpaymentmethod.setup(dbPool);
    DAO.avtalegiroagreements.setup(dbPool);
    DAO.facebook.setup(dbPool);
    DAO.logging.setup(dbPool);
    DAO.tax.setup(dbPool);

    //Convenience functions for transactions
    //Use the returned transaction object for queries in the transaction
    dbPool.startTransaction = async function () {
      try {
        let transaction = await dbPool.getConnection();
        await transaction.query("START TRANSACTION");
        return transaction;
      } catch (ex) {
        console.log(ex);
        throw new Error("Fatal error, failed to start transaction");
      }
    };

    dbPool.rollbackTransaction = async function (transaction) {
      try {
        await transaction.query("ROLLBACK");
        transaction.release();
      } catch (ex) {
        console.log(ex);
        throw new Error("Fatal error, failed to rollback transaction");
      }
    };

    dbPool.commitTransaction = async function (transaction) {
      try {
        await transaction.query("COMMIT");
        transaction.release();
      } catch (ex) {
        console.log(ex);
        throw new Error("Fatal error, failed to commit transaction");
      }
    };

    cb();
  },
};
