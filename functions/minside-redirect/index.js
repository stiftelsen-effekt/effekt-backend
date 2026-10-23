/**
 * minside.gieffektivt.no/<urlcode>  ->  302  https://data.gieffektivt.no/vipps/agreement/minside/<urlcode>
 *
 * Vipps agreements store merchantAgreementUrl as `${MIN_SIDE_URL}/${urlcode}`
 * (src/custom_modules/vipps.ts), so existing agreements keep pointing at this
 * host. The query string, if any, is carried over unchanged.
 *
 * The logic is kept identical to the version deployed from the console in 2023
 * (gs://gcf-sources-.../minside-redirect-.../version-6): only a single, non-empty
 * path segment is redirected; everything else (including "/") is a 404.
 */
const TARGET = "https://data.gieffektivt.no/vipps/agreement/minside/";

exports.prod = (req, res) => {
  const split = req.url.split("/");
  if (split.length == 2 && split[1].length > 0) {
    res.redirect(`${TARGET}${split[1]}`);
  } else {
    res.status(404).send("Not found");
  }
};
