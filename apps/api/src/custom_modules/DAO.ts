import { tax } from "./DAO_modules/tax";
import { donors } from "./DAO_modules/donors";
import { donations } from "./DAO_modules/donations";
import { distributions } from "./DAO_modules/distributions";
import { vipps } from "./DAO_modules/vipps";
import { facebook } from "./DAO_modules/facebook";
import { payment } from "./DAO_modules/payment";
import { parsing } from "./DAO_modules/parsing";
import { referrals } from "./DAO_modules/referrals";
import { meta } from "./DAO_modules/meta";
import { initialpaymentmethod } from "./DAO_modules/initialpaymentmethod";
import { avtalegiroagreements } from "./DAO_modules/avtalegiroagreements";
import { avtalegirocharges } from "./DAO_modules/avtalegirocharges";
import { logging } from "./DAO_modules/logging";
import { organizations } from "./DAO_modules/organizations";
import * as mysql from "mysql2/promise";
import { Prisma } from "@prisma/client";
import config from "../config";
import { causeareas } from "./DAO_modules/causeareas";
import { results } from "./DAO_modules/results";
import { mail } from "./DAO_modules/mail";
import { inflationadjustments } from "./DAO_modules/inflationadjustment";
import { agreementfeedback } from "./DAO_modules/agreementfeedback";
import { fundraisers } from "./DAO_modules/fundraisers";
import { donationReferralCodes } from "./DAO_modules/donationReferralCodes";
import { reviewqueue } from "./DAO_modules/reviewqueue";
import { agreements } from "./DAO_modules/agreements";
import { cancelledAgreements } from "./DAO_modules/cancelledAgreements";
import { regranting } from "./DAO_modules/regranting";
import { analysis } from "./DAO_modules/analysis";
import { donorCohorts } from "./DAO_modules/donorCohorts";
import { pledges } from "./DAO_modules/pledges";
import { regrantingTrace } from "./DAO_modules/regrantingTrace";
import { regrantingOnward } from "./DAO_modules/regrantingOnward";
import { paymentIntents } from "./DAO_modules/paymentIntents";
import { homeTrends } from "./DAO_modules/homeTrends";

/**
 * Generated prisma types assume certain transformations applied by prisma client
 */
export type SqlResult<T> =
  T extends Array<infer U>
    ? {
        [K in keyof T]: SqlResult<U>;
      }
    : T extends Record<string, any>
      ? {
          [K in keyof T]: T[K] extends boolean
            ? 0 | 1
            : T[K] extends boolean | null
              ? 0 | 1 | null
              : // Date
                T[K] extends Date
                ? Date
                : // Date or null
                  T[K] extends Date | null
                  ? Date | null
                  : T[K] extends Prisma.Decimal
                    ? string /* decimal is a string: https://github.com/sidorares/node-mysql2/issues/1561 */
                    : T[K] extends Prisma.Decimal | null
                      ? string | null
                      : T[K];
        }
      : T;

export const DAO = {
  //Submodules
  donors: donors,
  organizations: organizations,
  donations: donations,
  distributions: distributions,
  causeareas: causeareas,
  payment: payment,
  vipps: vipps,
  parsing: parsing,
  referrals: referrals,
  meta: meta,
  initialpaymentmethod: initialpaymentmethod,
  avtalegiroagreements: avtalegiroagreements,
  avtalegirocharges: avtalegirocharges,
  facebook: facebook,
  tax: tax,
  logging: logging,
  results: results,
  mail: mail,
  inflationadjustments: inflationadjustments,
  agreementfeedback: agreementfeedback,
  fundraisers: fundraisers,
  donationReferralCodes: donationReferralCodes,
  reviewqueue: reviewqueue,
  agreements: agreements,
  cancelledAgreements: cancelledAgreements,
  regranting: regranting,
  analysis: analysis,
  donorCohorts: donorCohorts,
  pledges: pledges,
  regrantingTrace: regrantingTrace,
  regrantingOnward: regrantingOnward,
  paymentIntents: paymentIntents,
  homeTrends: homeTrends,

  dbPool: undefined as mysql.Pool | undefined,

  /**
   * Sets up a connection to the database, uses config.js file for parameters
   * @param {function} cb Callback for when DAO has been sucessfully set up
   */
  connect: async function (cb) {
    const args = {
      user: config.db_username,
      password: config.db_password,
      database: config.db_name,
      waitForConnections: true,
      // DB_CONNECTION_LIMIT, 10 by default (the mysql2 default)
      connectionLimit: config.db_connection_limit,
      enableKeepAlive: true as true, // Workaround for type checking quirk
      timezone: "+00:00",
      // Bind objects as strings instead of expanding them to `key` = value, which turns
      // `WHERE col = ?` into an always-true condition when a request body sends an object
      stringifyObjects: true,
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
      process.exit();
    }

    cb();
  },

  query: async function <T = any>(
    query,
    params: any = undefined,
    retries = 0,
  ): Promise<[SqlResult<T>, mysql.FieldPacket[]]> {
    try {
      return await (this as typeof DAO).dbPool!.query<any>(query, params);
    } catch (ex) {
      if (retries < 7 && ex.code === "PROTOCOL_CONNECTION_LOST") {
        console.log("Retrying query");
        await wait(2 ** retries * 100);
        return await (this as typeof DAO).query<T>(query, params, retries + 1);
      } else {
        console.error(ex);
        throw ex;
      }
    }
  },

  execute: async function <T = any>(
    query: string,
    params: any = undefined,
    retries = 0,
  ): Promise<[SqlResult<T>, mysql.FieldPacket[]]> {
    try {
      return await DAO.dbPool!.execute<any>(query, params);
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
        throw ex;
      }
    }
  },

  //Convenience functions for transactions
  //Use the returned transaction object for queries in the transaction
  startTransaction: async function (): Promise<mysql.PoolConnection> {
    let transaction: mysql.PoolConnection | undefined;
    try {
      const connection: mysql.PoolConnection = await this.dbPool.getConnection();
      transaction = connection;
      // mysql2 wraps each checkout in a new object, but don't rely on it
      finishedTransactions.delete(connection);
      await connection.query("START TRANSACTION");
      return connection;
    } catch (ex) {
      console.log(ex);
      transaction?.release();
      throw new Error("Fatal error, failed to start transaction");
    }
  },

  /**
   * Rolls back and releases the connection. A no-op for a transaction that has already been
   * committed or rolled back, so callers can roll back in a catch after a failed commit.
   */
  rollbackTransaction: async function (transaction) {
    if (finishedTransactions.has(transaction)) return;
    finishedTransactions.add(transaction);
    try {
      await transaction.query("ROLLBACK");
    } catch (ex) {
      console.log(ex);
      throw new Error("Fatal error, failed to rollback transaction");
    } finally {
      transaction.release();
    }
  },

  /**
   * Commits and releases the connection. If the COMMIT fails the transaction is rolled back
   * before the connection goes back to the pool.
   */
  commitTransaction: async function (transaction) {
    if (finishedTransactions.has(transaction)) {
      throw new Error("Fatal error, transaction was already committed or rolled back");
    }
    finishedTransactions.add(transaction);
    try {
      await transaction.query("COMMIT");
    } catch (ex) {
      console.log(ex);
      try {
        await transaction.query("ROLLBACK");
      } catch (rollbackEx) {
        console.log(rollbackEx);
      }
      throw new Error("Fatal error, failed to commit transaction");
    } finally {
      transaction.release();
    }
  },
};

/** Connections whose transaction has been committed or rolled back, and released. */
const finishedTransactions = new WeakSet<object>();

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
