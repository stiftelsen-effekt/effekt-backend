const fetch = require("node-fetch");

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.default = async (req, res) => {
  // let message = req.query.message || req.body.message || 'Hello World!';

  try {
    // Fetch access token
    let response = await fetch("https://gieffektivt.eu.auth0.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"client_id":"${process.env.CLIENTID}","client_secret":"${process.env.CLIENTSECRET}","audience":"https://data.gieffektivt.no","grant_type":"client_credentials"}`,
    });

    if (response.status != 200) throw new Error("Could not get access token");

    response = await response.json();
    const token = response["access_token"];

    switch (req.query.type) {
      case "ocr":
        let ocrresponse = await fetch("https://data.gieffektivt.no/scheduled/ocr/", {
          method: "POST",
          headers: { authorization: "Bearer " + token },
        });
        if (ocrresponse.status !== 200) throw new Error("Failed to process OCR");
        res.send("OK");
        break;
      case "avtalegiro":
        let avtalegiroresponse = await fetch(
          "https://data.gieffektivt.no/scheduled/avtalegiro/?notify=true",
          { method: "POST", headers: { authorization: "Bearer " + token } },
        );
        if (avtalegiroresponse.status !== 200) throw new Error("Failed to process avtalegiro");
        res.send("OK");
        break;
      case "avtalegiro_retry":
        let avtalegiroretryresponse = await fetch(
          "https://data.gieffektivt.no/scheduled/avtalegiro/retry",
          { method: "POST", headers: { authorization: "Bearer " + token } },
        );
        if (avtalegiroretryresponse.status !== 200)
          throw new Error("Failed to process avtalegiro retry");
        res.send("OK");
        break;
      case "vipps":
        let vippsresponse = await fetch("https://data.gieffektivt.no/scheduled/vipps", {
          method: "POST",
          headers: { authorization: "Bearer " + token },
        });
        if (vippsresponse.status !== 200) throw new Error("Failed to process vipps");
        res.send("OK");
        break;
      case "auth0check":
        let auth0checkresponse = await fetch(
          "https://data.gieffektivt.no/scheduled/auth0/validateusers",
          { method: "GET", headers: { authorization: "Bearer " + token } },
        );
        if (auth0checkresponse.status !== 200) throw new Error("Failed to process auth0 check");
        res.send("OK");
        break;
      case "followup":
        let followupresponse = await fetch(
          "https://data.gieffektivt.no/scheduled/initiate-follow-ups",
          { method: "POST", headers: { authorization: "Bearer " + token } },
        );
        if (followupresponse.status !== 200) throw new Error("Failed to process payment follow up");
        res.send("OK");
        break;
      case "mailchimp":
        let mailchimpresponse = await fetch(
          "https://data.gieffektivt.no/scheduled/mailchimp/newsletter/sync",
          { method: "POST", headers: { authorization: "Bearer " + token } },
        );
        if (mailchimpresponse.status !== 200) throw new Error("Failed to process mailchimp");
        res.send("OK");
        break;
      default:
        res
          .status(400)
          .send(
            "Missing query parameter {type}, or invalid value (ocr, avtalegiro, avtalegiro_retry, vipps, auth0check, followup, mailchimp are allowed values)",
          );
    }
    return;
  } catch (ex) {
    console.error(ex);
    res.status(500).send("Failed to fet auth0 access token");
  }
};
