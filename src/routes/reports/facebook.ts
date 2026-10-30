import { processFacebookReport } from "../../custom_modules/reportsService";

module.exports = async (req, res, next) => {
  if (!req.files || !req.files.report) return res.sendStatus(400);

  let result;
  try {
    result = await processFacebookReport(req.files.report.data);
  } catch (ex) {
    next(ex);
    return false;
  }

  res.json({
    status: 200,
    content: { fbCampaigns: result.fbCampaigns },
  });
};
