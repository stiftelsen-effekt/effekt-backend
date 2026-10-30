import { DAO } from "../../custom_modules/DAO";
import { adminProcedure, router } from "../trpc";

export const metaRouter = router({
  owners: adminProcedure.query(() => DAO.meta.getDataOwners()),
});
