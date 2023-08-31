import { Cause_areas, Organizations } from "@prisma/client";
import { DAO } from "../DAO";
import { CauseArea, Organization } from "../../schemas/types";
import { mapOrganization } from "./organizations";

export const causeareas = {
  getById: async function (id: number): Promise<CauseArea> {
    const [causeAreas] = await DAO.query<Cause_areas[]>(
      `
        SELECT * FROM Cause_areas WHERE ID = ?
      `,
      [id],
    );
    if (causeAreas.length === 0) throw new Error("Cause area not found");
    const mapped = causeAreas.map(mapCauseArea);

    return mapped[0];
  },
  updateById: async function (causeArea: CauseArea) {
    await DAO.query(
      `
        UPDATE Cause_areas SET name = ?, short_desc = ?, long_desc = ?, is_active = ?, ordering = ? WHERE ID = ?
      `,
      [
        causeArea.name,
        causeArea.shortDescription,
        causeArea.longDescription,
        causeArea.isActive,
        causeArea.ordering,
        causeArea.id,
      ],
    );
  },
  add: async function (causeArea: CauseArea) {
    await DAO.query(
      `
        INSERT INTO Cause_areas (name, short_desc, long_desc, is_active, ordering)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        causeArea.name,
        causeArea.shortDescription,
        causeArea.longDescription,
        causeArea.isActive,
        causeArea.ordering,
      ],
    );
  },
  getAll: async function (): Promise<CauseArea[]> {
    const [causeAreas] = await DAO.query<Cause_areas[]>(
      `
        SELECT * FROM Cause_areas
      `,
    );
    const mapped = causeAreas.map(mapCauseArea);

    return mapped;
  },
  deleteById: async function (id: number) {
    await DAO.query(
      `
        DELETE FROM Cause_areas WHERE ID = ?
      `,
      [id],
    );
  },
  getActive: async function (): Promise<CauseArea[]> {
    const [causeAreas] = await DAO.query<Cause_areas[]>(
      `
        SELECT * FROM Cause_areas WHERE is_active = 1 ORDER BY ordering ASC
      `,
    );
    const mapped = causeAreas.map(mapCauseArea);

    return mapped;
  },
  getActiveWithOrganizations: async function (): Promise<
    (CauseArea & { organizations: Organization[] })[]
  > {
    type PrefixedCauseAreaResult = {
      [Property in keyof Cause_areas as `CA_${Property}`]: Cause_areas[Property];
    };
    type PrefixedOrganizationResult = {
      [Property in keyof Organizations as `O_${Property}`]: Organizations[Property];
    };

    type QueryRowResult = PrefixedCauseAreaResult & PrefixedOrganizationResult;
    const [result] = await DAO.query<QueryRowResult[]>(
      `
        SELECT
          Cause_areas.ID as CA_ID,
          Cause_areas.name as CA_name,
          Cause_areas.short_desc as CA_short_desc,
          Cause_areas.long_desc as CA_long_desc,
          Cause_areas.is_active as CA_is_active,
          Cause_areas.info_url as CA_info_url,
          Cause_areas.ordering as CA_ordering,
          Organizations.ID AS O_ID,
          Organizations.full_name AS O_full_name,
          Organizations.abbriv AS O_abbriv,
          Organizations.short_desc AS O_short_desc,
          Organizations.long_desc AS O_long_desc,
          Organizations.is_active AS O_is_active,
          Organizations.ordering AS O_ordering,
          Organizations.info_url AS O_info_url,
          Organizations.std_percentage_share AS O_std_percentage_share
          
          FROM Cause_areas 
            INNER JOIN Organizations ON Organizations.cause_area_id = Cause_areas.ID

          WHERE Cause_areas.is_active = 1 AND Organizations.is_active = 1
          ORDER BY Cause_areas.ordering, Organizations.ordering ASC
      `,
    );

    const causeAreas: (CauseArea & { organizations: Organization[] })[] = [];
    for (const row of result) {
      const causeArea = mapCauseArea({
        ID: row.CA_ID,
        name: row.CA_name,
        short_desc: row.CA_short_desc,
        long_desc: row.CA_long_desc,
        is_active: row.CA_is_active,
        info_url: row.CA_info_url,
        ordering: row.CA_ordering,
      });
      const organization = mapOrganization({
        ID: row.O_ID,
        full_name: row.O_full_name,
        abbriv: row.O_abbriv,
        short_desc: row.O_short_desc,
        long_desc: row.O_long_desc,
        is_active: row.O_is_active,
        info_url: row.O_info_url,
        ordering: row.O_ordering,
        cause_area_ID: row.CA_ID,
        std_percentage_share: row.O_std_percentage_share,
      });
      const existingCauseArea = causeAreas.find((ca) => ca.id === causeArea.id);
      if (existingCauseArea) {
        existingCauseArea.organizations.push(organization);
      } else {
        causeAreas.push({ ...causeArea, organizations: [organization] });
      }
    }

    return causeAreas;
  },
};

export const mapCauseArea = (c: Cause_areas): CauseArea => ({
  id: c.ID,
  name: c.name,
  shortDescription: c.short_desc,
  longDescription: c.long_desc,
  informationUrl: c.info_url,
  isActive: c.is_active == 1,
  ordering: c.ordering,
});
