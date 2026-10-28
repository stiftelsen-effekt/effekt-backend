import { DAO } from "../DAO";

/**
 * A pledge (tilsagn): a decided gift that is not received yet. Holds only the amount and
 * dates, never who made it. Open while receivedDate is null.
 */
export type Pledge = {
  id: number;
  sum: number;
  decidedDate: string;
  receivedDate: string | null;
  donationId: number | null;
};

export type PledgeInput = {
  sum: number;
  decidedDate: string;
  receivedDate: string | null;
  donationId: number | null;
};

type PledgeRow = {
  ID: number;
  Sum: string;
  Decided_date: Date;
  Received_date: Date | null;
  Donation_ID: number | null;
};

// DATE columns come back as midnight UTC, since the pool runs in UTC
const toDateString = (date: Date) => date.toISOString().slice(0, 10);

const mapPledge = (row: PledgeRow): Pledge => ({
  id: row.ID,
  sum: parseFloat(row.Sum),
  decidedDate: toDateString(row.Decided_date),
  receivedDate: row.Received_date ? toDateString(row.Received_date) : null,
  donationId: row.Donation_ID,
});

/** Open pledges first, then the most recently decided */
async function getAll(): Promise<Pledge[]> {
  const [rows] = await DAO.query<PledgeRow[]>(
    `
    SELECT ID, Sum, Decided_date, Received_date, Donation_ID
    FROM Pledges
    ORDER BY Received_date IS NOT NULL, Decided_date DESC, ID DESC
    `,
  );
  return rows.map(mapPledge);
}

async function getById(id: number): Promise<Pledge | null> {
  const [rows] = await DAO.query<PledgeRow[]>(
    `
    SELECT ID, Sum, Decided_date, Received_date, Donation_ID
    FROM Pledges
    WHERE ID = ?
    `,
    [id],
  );
  return rows.length > 0 ? mapPledge(rows[0]) : null;
}

async function add(pledge: PledgeInput): Promise<number> {
  const [result] = await DAO.query(
    `
    INSERT INTO Pledges (Sum, Decided_date, Received_date, Donation_ID)
    VALUES (?, ?, ?, ?)
    `,
    [pledge.sum, pledge.decidedDate, pledge.receivedDate, pledge.donationId],
  );
  return result.insertId;
}

async function update(id: number, pledge: PledgeInput): Promise<boolean> {
  const [result] = await DAO.query(
    `
    UPDATE Pledges
    SET Sum = ?, Decided_date = ?, Received_date = ?, Donation_ID = ?
    WHERE ID = ?
    `,
    [pledge.sum, pledge.decidedDate, pledge.receivedDate, pledge.donationId, id],
  );
  return result.affectedRows > 0;
}

async function remove(id: number): Promise<boolean> {
  const [result] = await DAO.query(`DELETE FROM Pledges WHERE ID = ?`, [id]);
  return result.affectedRows > 0;
}

async function donationExists(donationId: number): Promise<boolean> {
  const [rows] = await DAO.query<{ ID: number }[]>(`SELECT ID FROM Donations WHERE ID = ?`, [
    donationId,
  ]);
  return rows.length > 0;
}

export const pledges = {
  getAll,
  getById,
  add,
  update,
  remove,
  donationExists,
};
