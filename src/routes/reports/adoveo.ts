import { processFundraisingReport } from "../../custom_modules/adoveo";

module.exports = async (req, res, next) => {
  const result = await processFundraisingReport(req.files.report.data);

  res.json({
    status: 200,
    message: "OK",
  });
};
