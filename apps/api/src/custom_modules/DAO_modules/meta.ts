import type { Data_owner } from "@prisma/client";
import { DAO } from "../DAO";

export type DataOwner = { id: number; name: string; default: boolean };

/**
 * Data_owner ID for EA Norge. Donations with this owner are made through EA Giverportal,
 * EA Norway's own offering. For tax purposes they go to the same legal entity as
 * "EAN + Effekt" donations; the owner only marks them as given to EA Norway for donors.
 */
export const EA_NORGE_META_OWNER_ID = 2;

//region Get

/**
 * @typedef DataOwner
 * @prop {Number} id
 * @prop {String} name
 * @prop {Boolean} default
 */

/**
 * Gets the diferent data owner actors from the DB
 * @returns {Array<DataOwner>} An array of DataOwner objects
 */
async function getDataOwners(): Promise<DataOwner[]> {
  var [res] = await DAO.query<Data_owner[]>(`SELECT * FROM Data_owner`);
  return res.map((owner) => ({
    id: owner.ID,
    name: owner.owner,
    default: owner.default == 1 ? true : false,
  }));
}

/**
 * Gets the default owner ID from the DB
 * @returns {Number} The default owner ID
 */
async function getDefaultOwnerID() {
  var [res] = await DAO.query<{ ID: number }[]>("SELECT ID FROM Data_owner WHERE `default` = 1");
  if (res.length == 0) {
    throw new Error("No default owner found");
  }
  return res[0].ID;
}

//endregion

//region Add

//endregion

//region Modify

//endregion

//region Delete
//endregion

export const meta = {
  getDataOwners,
  getDefaultOwnerID,
};
