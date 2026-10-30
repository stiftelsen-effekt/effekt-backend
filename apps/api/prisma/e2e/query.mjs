/**
 * Runs one read query against the full-stack e2e database and prints the rows as JSON, for the
 * Cypress `queryE2EDb` task (apps/web/cypress-fullstack.config.ts): the widget spec checks that a
 * donation registered through the website reached the database. Never point it at anything but the
 * throwaway local e2e database.
 *
 *   DB_URL=mysql://root:effekt-local@127.0.0.1:3317/EffektDonasjonDB_Local \
 *     node prisma/e2e/query.mjs "SELECT * FROM Distributions WHERE KID = ?" '["12345678"]'
 */
import mysql from "mysql2/promise";

const [sql, params = "[]"] = process.argv.slice(2);
if (!/^\s*select\b/i.test(sql ?? "")) throw new Error("Only SELECT queries");

const connection = await mysql.createConnection(process.env.DB_URL);
try {
  const [rows] = await connection.query(sql, JSON.parse(params));
  process.stdout.write(JSON.stringify(rows));
} finally {
  await connection.end();
}
