import { Organizations } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import { Organization } from "../../schemas/types";

//region Get

/**
 * Returns all organizations found with given IDs
 * @param {Array<number>} IDs
 * @returns {Array<Organization>}
 */
async function getByIDs(IDs) {
  var [organizations] = await DAO.execute<Organizations[]>(
    "SELECT * FROM Organizations WHERE ID in (" + "?,".repeat(IDs.length).slice(0, -1) + ")",
    IDs,
  );

  return organizations;
}

/**
 * Returns an organization with given ID
 * @param {number} ID
 * @returns {Organization}
 */
async function getByID(ID) {
  var [organization] = await DAO.execute<Organizations[]>(
    "SELECT * FROM Organizations WHERE ID = ? LIMIT 1",
    [ID],
  );

  if (organization.length > 0) return organization[0];
  else return null;
}

/**
 * Returns current active organiztions
 * Active meaning we accept donations for them
 * Inactive organizations are organizations which we no longer support
 * @returns {Array<Organization>}
 */
async function getActive() {
  var [organizations] = await DAO.execute<Organizations[]>(`
            SELECT * FROM Organizations 
                WHERE is_active = 1
                ORDER BY ordering ASC`);

  return organizations.map(mapOrganization);
}

/**
 * Returns all organizations in the database
 * @returns {Array<Organization>} All organizations in DB
 */
async function getAll() {
  var [organizations] = await DAO.execute<Organizations[]>(`SELECT * FROM Organizations`);

  return organizations.map(mapOrganization);
}
//endregion

//region Add
/**
 * Adds a new organization
 * @param {Organization} organization The organization object to add
 * @returns {Promise<boolean>} Whether the operation was successful
 */
async function add(organization: {
  name: string;
  abbreviation: string;
  shortDescription?: string;
  longDescription?: string;
  informationUrl?: string;
  isActive: boolean;
  ordering: number;
  standardShare: number;
  causeAreaId: number;
}) {
  await DAO.query(
    `INSERT INTO Organizations (full_name, abbriv, short_desc, long_desc, info_url, is_active, ordering, std_percentage_share, cause_area_ID)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organization.name,
      organization.abbreviation,
      organization.shortDescription,
      organization.longDescription,
      organization.informationUrl,
      organization.isActive ? 1 : 0,
      organization.ordering,
      organization.standardShare,
      organization.causeAreaId,
    ],
  );
}
//endregion

//region Modify
/**
 * Updates an organization by ID
 * @param {Organization} organization The organization object with updated values
 * @returns {Promise<void>}
 */
async function updateById(organization: {
  id: number;
  name: string;
  abbreviation: string;
  shortDescription?: string;
  longDescription?: string;
  informationUrl?: string;
  isActive: boolean;
  ordering: number;
  standardShare: number;
  causeAreaId: number;
}) {
  await DAO.query(
    `UPDATE Organizations SET 
     full_name = ?, abbriv = ?, short_desc = ?, long_desc = ?, info_url = ?, 
     is_active = ?, ordering = ?, std_percentage_share = ?, cause_area_ID = ?
     WHERE ID = ?`,
    [
      organization.name,
      organization.abbreviation,
      organization.shortDescription,
      organization.longDescription,
      organization.informationUrl,
      organization.isActive ? 1 : 0,
      organization.ordering,
      organization.standardShare,
      organization.causeAreaId,
      organization.id,
    ],
  );
}
//endregion

//region Delete
/**
 * Deletes an organization by ID
 * @param {number} id The organization ID
 * @returns {Promise<void>}
 */
async function deleteById(id: number) {
  await DAO.query(`DELETE FROM Organizations WHERE ID = ?`, [id]);
}
//endregion

//region Helpers
/**
 * Used in array.map, used to map database rows to JS like naming
 * @param {Object} org A line from a database query representing an organization
 * @returns {Object} A mapping with JS like syntax instead of the db fields, camel case instead of underscore and so on
 */
export const mapOrganization = (org: SqlResult<Organizations>): Organization => {
  return {
    id: org.ID,
    name: org.full_name,
    widgetDisplayName: org.widget_display_name,
    widgetContext: org.widget_context,
    abbreviation: org.abbriv,
    shortDescription: org.short_desc,
    longDescription: org.long_desc,
    standardShare: org.std_percentage_share,
    informationUrl: org.info_url,
    isActive: org.is_active === 1,
    ordering: org.ordering,
    causeAreaId: org.cause_area_ID,
  };
};

export const organizations = {
  getByIDs,
  getByID,
  getActive,
  getAll,
  add,
  updateById,
  deleteById,
};
