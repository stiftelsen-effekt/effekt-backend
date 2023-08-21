import { tax } from "./DAO_modules/tax";
import { donors } from "./DAO_modules/donors";
import { donations } from "./DAO_modules/donations";
import { distributions } from "./DAO_modules/distributions";
import { vipps } from "./DAO_modules/vipps";
import { swish } from "./DAO_modules/swish";
import { facebook } from "./DAO_modules/facebook";
import { payment } from "./DAO_modules/payment";
import { parsing } from "./DAO_modules/parsing";
import { referrals } from "./DAO_modules/referrals";
import { meta } from "./DAO_modules/meta";
import { initialpaymentmethod } from "./DAO_modules/initialpaymentmethod";
import { avtalegiroagreements } from "./DAO_modules/avtalegiroagreements";
import { logging } from "./DAO_modules/logging";
import { organizations } from "./DAO_modules/organizations";
import * as mysql from "mysql2/promise";
import { Prisma } from "@prisma/client";
import config from "../config";

/**
 * Generated prisma types assume certain transformations applied by prisma client
 */
export type SqlResult<T> = T extends Array<infer U>
  ? {
      [K in keyof T]: SqlResult<U>;
    }
  : T extends Record<string, any>
  ? {
      [K in keyof T]: T[K] extends boolean
        ? 0 | 1
        : T[K] extends Date
        ? string
        : T[K] extends Prisma.Decimal
        ? string /* decimal is a string: https://github.com/sidorares/node-mysql2/issues/1561 */
        : T[K];
    }
  : T;

export const DAO = {
  //Submodules
  donors: donors,
  organizations: organizations,
  donations: donations,
  distributions: distributions,
  payment: payment,
  vipps: vipps,
  parsing: parsing,
  referrals: referrals,
  meta: meta,
  initialpaymentmethod: initialpaymentmethod,
  avtalegiroagreements: avtalegiroagreements,
  facebook: facebook,
  tax: tax,
  logging: logging,
  swish: swish,

  dbPool: undefined as mysql.Pool | undefined,

  /**
   * Sets up a connection to the database, uses config.js file for parameters
   * @param {function} cb Callback for when DAO has been sucessfully set up
   */
  connect: async function (cb?: () => void) {
    const args = {
      user: config.db_username,
      password: config.db_password,
      database: config.db_name,
      waitForConnections: true,
      enableKeepAlive: true as true, // Workaround for type checking quirk
      timezone: "+00:00",
    };

    // Using Unix sockets to connect to cloud SQL is the default way
    // https://cloud.google.com/sql/docs/mysql/connect-run#connect-unix-socket
    // K_SERVICE is used to detect if running on GCP Cloud Run
    if (process.env.K_SERVICE != null) {
      args["socketPath"] = `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
    } else {
      args["host"] = config.db_host; // localhost is default in undefined
    }

    this.dbPool = mysql.createPool(args);

    //Check whether connection was successfull
    //Weirdly, this is the proposed way to do it
    try {
      await this.dbPool.query("SELECT 1 + 1 AS Solution");
      console.log("Connected to database | Using database " + config.db_name);
    } catch (ex) {
      console.error("Connection to database failed! | Using database " + config.db_name);
      console.log(ex);
      process.exit(1);
    }

    cb();
  },

  query: async function <T = any>(
    query,
    params = undefined,
    retries = 0,
  ): Promise<[SqlResult<T>, mysql.FieldPacket[]]> {
    try {
      return await (this as typeof DAO).dbPool.query<any>(query, params);
    } catch (ex) {
      if (retries < 7 && ex.code === "PROTOCOL_CONNECTION_LOST") {
        console.log("Retrying query");
        await wait(2 ** retries * 100);
        return await (this as typeof DAO).query<T>(query, params, retries + 1);
      } else {
        console.error(ex);
        throw new Error(ex);
      }
    }
  },

  execute: async function <T = any>(
    query: string,
    params = undefined,
    retries = 0,
  ): Promise<[SqlResult<T>, mysql.FieldPacket[]]> {
    try {
      return await DAO.dbPool.execute<any>(query, params);
    } catch (ex) {
      if (retries < 7 && ex.code === "PROTOCOL_CONNECTION_LOST") {
        console.error(ex);
        console.log(
          "Retrying query `" +
            query.substr(0, Math.min(query.length, 120)) +
            (query.length > 120 ? "...`" : "`"),
          retries,
        );
        await wait(2 ** retries * 1000);
        return await (this as typeof DAO).execute<T>(query, params, retries + 1);
      } else {
        console.error(ex);
        throw new Error(ex);
      }
    }
  },

  //Convenience functions for transactions
  //Use the returned transaction object for queries in the transaction
  startTransaction: async function (): Promise<mysql.PoolConnection> {
    try {
      let transaction = await this.dbPool.getConnection();
      await transaction.query("START TRANSACTION");
      return transaction;
    } catch (ex) {
      console.log(ex);
      throw new Error("Fatal error, failed to start transaction");
    }
  },

  rollbackTransaction: async function (transaction) {
    try {
      await transaction.query("ROLLBACK");
      transaction.release();
    } catch (ex) {
      console.log(ex);
      throw new Error("Fatal error, failed to rollback transaction");
    }
  },

  commitTransaction: async function (transaction) {
    try {
      await transaction.query("COMMIT");
      transaction.release();
    } catch (ex) {
      console.log(ex);
      throw new Error("Fatal error, failed to commit transaction");
    }
  },
};

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
