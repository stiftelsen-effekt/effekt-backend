const fetch = require('node-fetch');

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
    let response = await fetch('https://gieffektivt.eu.auth0.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"client_id":"${process.env.CLIENTID}","client_secret":"${process.env.CLIENTSECRET}","audience":"https://data.gieffektivt.no","grant_type":"client_credentials"}`
    })

    if (response.status != 200)
      throw new Error("Could not get access token")

    response = await response.json()
    const token = response["access_token"]

    switch (req.query.type) {
      case "ocr":
        let ocrresponse = await fetch("https://data.gieffektivt.no/scheduled/ocr/", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (ocrresponse.status !== 200)
          throw new Error("Failed to process OCR")
        res.send("OK")
        break
      case "avtalegiro":
        let avtalegiroresponse = await fetch("https://data.gieffektivt.no/scheduled/avtalegiro/?notify=true", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (avtalegiroresponse.status !== 200)
          throw new Error("Failed to process avtalegiro")
        res.send("OK")
        break
      case "avtalegiro_retry":
        let avtalegiroretryresponse = await fetch("https://data.gieffektivt.no/scheduled/avtalegiro/retry", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (avtalegiroretryresponse.status !== 200)
          throw new Error("Failed to process avtalegiro retry")
        res.send("OK")
        break
      case "vipps":
        let vippsresponse = await fetch("https://data.gieffektivt.no/scheduled/vipps", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (vippsresponse.status !== 200)
          throw new Error("Failed to process vipps")
        res.send("OK")
        break
      case "auth0check":
        let auth0checkresponse = await fetch("https://data.gieffektivt.no/scheduled/auth0/validateusers", { method: 'GET', headers: { "authorization": "Bearer " + token } })
        if (auth0checkresponse.status !== 200)
          throw new Error("Failed to process auth0 check")
        res.send("OK")
        break
      case "followup":
        let followupresponse = await fetch("https://data.gieffektivt.no/scheduled/initiate-follow-ups", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (followupresponse.status !== 200)
          throw new Error("Failed to process payment follow up")
        res.send("OK")
        break
      case "mailchimp":
        let mailchimpresponse = await fetch("https://data.gieffektivt.no/scheduled/mailchimp/newsletter/sync", { method: 'POST', headers: { "authorization": "Bearer " + token } })
        if (mailchimpresponse.status !== 200)
          throw new Error("Failed to process mailchimp")
        res.send("OK")
        break
      case "adoveo":
        let adoveoToken = await getAdoveoAuthToken()
        if (!adoveoToken)
          throw new Error("Failed to get adoveo token")
        let adoveocrawlerresponse = await fetch("https://data.gieffektivt.no/scheduled/fundraiser/crawler", { method: 'POST', headers: { "authorization": "Bearer " + token, "Content-Type": "application/json" }, body: `{"token":"${adoveoToken}"}` })
        if (adoveocrawlerresponse.status !== 200)
          throw new Error("Failed to crawl fundraisers")
        res.send("OK")
        break
      default:
        res.status(400).send("Missing query parameter {type}, or invalid value (avtalegiro, avtalegiroretry, ocr, vippsrecurring, followup are allowed values)")
    }
    return
  } catch(ex) {
    console.error(ex)
    res.status(500).send("Failed to fet auth0 access token");
  }
};

async function getAdoveoAuthToken() {
  const puppeteer = require('puppeteer')

  const browser = await puppeteer.launch();
  
  try {
    const page = await browser.newPage();
    let authToken = null;
    
    // Enable request interception
    await page.setRequestInterception(true);

    // Listen for requests
    page.on('request', async request => {
      if (request.url().startsWith('https://api.adoveo.com')) {
        const headers = request.headers();
        if (headers.authorization?.startsWith('Bearer ')) {
          authToken = headers.authorization.replace('Bearer ', '');
          console.log('Found bearer token!');
        }
      }
      request.continue();
    });

    console.log('Navigating to page...');
    await page.goto("https://manager.adoveo.com/", {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    const loginButton = await page.locator('text/Log in').click();

    // Login
    await page.locator('#a0-lock [name="email"]').fill(process.env.ADOVEO_USERNAME);
    await page.locator('#a0-lock [name="password"]').fill(process.env.ADOVEO_PASSWORD);
    await page.click('#a0-lock [type="submit"]');

    // Wait for the first API request that contains the token
    console.log('Waiting for auth token...');
    while (!authToken) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Successfully captured auth token');
    return authToken;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    throw error;
  } finally {
    await browser.close();
  }
}
