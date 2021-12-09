## Effect Foundation API

The Effect Foundation API is used by all our core application for data storage. The API is connected to a MySQL database, where our donation data is stored. This includes our donations, donors, donation distributions, recurring donation agreements, referral statistics, authentification info, payment methods and so on.

The API is also responsible for handling payment processing.

---

**Table of contents**

- [Effect Foundation API](#effect-foundation-api)
- [API endpoints](#api-endpoints)
- [Get started developing](#get-started-developing)
  - [Google cloud setup](#google-cloud-setup)
  - [Google cloud sql auth proxy](#google-cloud-sql-auth-proxy)
  - [Configuring the API](#configuring-the-api)
  - [Installing packages and running the project](#installing-packages-and-running-the-project)
  - [Testing](#testing)
- [Build and deployment](#build-and-deployment)
  - [Environments](#environments)
  - [Google cloud build](#google-cloud-build)
- [Code Structure & Implementation Details](#code-structure--implementation-details)
  - [Routes](#routes)
  - [Business logic](#business-logic)
  - [Authentication & Authorization](#authentication--authorization)
  - [KIDs](#kids)
  - [Data Access](#data-access)
  - [Email](#email)
  - [Logging](#logging)
  - [Views](#views)
  - [Scheduled jobs](#scheduled-jobs)
  - [Tests](#tests)
- [Database](#database)
  - [Tables Overview](#tables-overview)
  - [Schema and Migrations](#schema-and-migrations)
- [Payment processing](#payment-processing)
  - [Bank](#bank)
  - [Vipps](#vipps)
  - [PayPal](#paypal)
  - [Facebook](#facebook)

---

## API endpoints

Our API endpoints are described in the swagger documentation available [here (production)](https://data.gieffektivt.no/docs/) or [here (development)](https://dev.data.gieffektivt.no/docs/)).

We are currently working on improving this documentation.

## Get started developing

To run the API locally, we need to setup a few things.

1. Setup google gloud account
2. Setup google cloud sql auth proxy
3. Configure the API with authentification variables
4. Install packages and run the code
5. Running tests

### Google cloud setup

Make sure you have a google cloud account, and get someone in the team to authorize you with the SQL client privilege.

### Google cloud sql auth proxy

When connection to a google cloud sql instance, we are required to connect through [cloud sql auth proxy](https://cloud.google.com/sql/docs/mysql/connect-admin-proxy). This is because by default, sql instances are not open to the wider internet. This is a good thing from a security perspective.

Having authorized the google cloud cli, follow the instructions in the google documentation. The instance name of our database is `hidden-display-243419:europe-north1:effekt-db`. Thus, the command to setup the proxy is

```
./cloud_sql_proxy -instances=hidden-display-243419:europe-north1:effekt-db=tcp:3306
```

if cloud_sql_proxy is located in the same folder in your terminal. We recommend you store the binary somewhere on your computer, and add it to your path.

It's also possible to create an alias on macos / linux to avoid having to type in the entire command each time you wish to connect.

If all has gone well, you should be seeing this in your terminal of choice.

<img src="docs/sql_proxy_terminal.png" width="500" />

The proxy is now listening for connections on port 3306 (the standard mysql port), and forwards any communication to the internal google cloud network through a secure tunnel.

### Configuring the API

Before we can run the API, we need to specify some environment variables. You can see all of the variables in [config.js](./config.js). Many of the variables declared here are not needed for most development. 

To get started, we **need** these to be set to run the api:

* `DB_USER`
* `DB_PASS`
* `DB_NAME`

The other configuration variables are only needed to run specific parts of the code, such as payment processing or mail processing. 

Depending on your operation system, setting environment variables will be a different process. Check out the procedure for [windows](docs/win_environment_variables.md) and [macos / linux](nix_environment_variables.md) respectively.

`DB_USER` and `DB_PASS` are the username and password for our database user. You may enquire about these credentials on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) slack channel, and we will send them to you privately.

At the Effect Foundation, we have two databases on our SQL instance: `EffektDonasjonDB` and `EffektDonasjonDB_Dev`. The former is for our live production data, whilst the latter is for development. Set the environment variable `DB_NAME` to `EffektDonasjonDB_Dev`.

If you wish to test restricted routes without having to authorize, you may also set `AUTH_REQUIRED` to false. More about [authorization](#authorization) is found in a latter section.

One way to set and pass environment variables to the program when running it on nix is as follows:
```
DB_USER='a' DB_PASS='b' DB_NAME='EffektDonasjonDB_Dev' npm start
```

### Installing packages and running the project

Finally, we are ready to start the application. Clone this repository to your local machine.

```
git clone https://github.com/stiftelsen-effekt/effekt-backend.git
```

> **Note** To clone the repository, you must have access and be part of the [Stiftelsen Effekt github organization](https://github.com/stiftelsen-effekt). You must also be logged in on git on your local machine. If you do not have access to clone the repository, enquire on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) channel.

Having cloned the repository, we must install all the packages the api utilizes. The api is built using [node.js](https://nodejs.org/en/) and npm is the package manager.

Install the requisite packages with the command 

```
npm install
```

in the root folder of the cloned repository. After the installer has finished, you are ready to run the API with the command

```
npm start
```

again in the root folder of the cloned repository. If all goes well, you should be seeing something like this in your terminal

<img src="docs/api_terminal.png" width="500" />


> **Note** Don't forget that the cloud sql auth proxy must be running in the background.

We can verify that the api is indeed operational by testing it in our browser. Navigation go http://localhost:3000 should yield a welcoming message.

<img src="docs/browser_root_route.png" width="500" />

### Testing

We use mocha for our unit tests. To run the test suite, use the command

```
npm test
```

which will yield something like this 

<img src="docs/tests_terminal.png" width="500" />

## Build and deployment

We have three main branches in the repository, `master`, `stage` and `dev`. Any commit to any of these branches will be automatically deployed to their respective environments, given that the build pipeline succeeds.

### Environments

**Production** or live is deployed from the `master` branch. The url for the deployment is https://data.gieffektivt.no. This is the environment used by our actual donors.

**Stage** is deployed from the `stage` branch. The url for the deployment is https://stage.data.gieffektivt.no. This environment is identical to production in terms of configuration, and uses the live production database. The intended usecase is to test new functionality in the same environment as the production api, whithout having to deploy the code to our users. Stage is espe

**Dev** is deployed from the `dev` branch. The url for the deployment is https://dev.data.gieffektivt.no. This environment uses the development database, and is unstable. If you wish to test that your code runs in the google cloud environment, you may merge your changes into the dev branch.

| Branch   | Url                               | Database               | Environment variables |
| -------- | --------------------------------- | ---------------------- | --------------------- |
| `Master` | https://data.gieffektivt.no       | `EffektDonasjonDB`     | Production            |
| `Stage`  | https://stage.data.gieffektivt.no | `EffektDonasjonDB`     | Production            |
| `Dev`    | https://dev.data.gieffektivt.no   | `EffektDonasjonDB_Dev` | Development           |

### Google cloud build

## Code Structure & Implementation Details

### Routes

Routes in `/routes` define which API endpoints exist, and what they do. They're roughly broken into files (and corresponding url sub-paths) by grouped functionality.

Routes are loaded into the app in `server.js`, and that set of endpoints is assigned a url subpath:
```
app.use('/donors', donorsRoute)
```
By convention, each subpath will have its own file in `/routes` with the same name, for example url `/donors` is implemented in `/routes/donors.js`

At a high level, here's what the subpaths do:
- `/auth`: authentication - logging in/out, passwords, and tokens
- `/donors`: CRUD endpoints for donor objects
- `/donations`: CRUD endpoints for donation objects
- `/distributions`: CRUD endpoints for donation percent allocations
- `/organizations`: CRUD endpoints for organization objects (example: Against Malaria Foundation)
- `/payment`: CRUD endpoints for metadata (example: fees) about payment methods
- `/referrals`: CRUD endpoints for donor referrals
- `/paypal`: endpoints for Paypal payments
- `/vipps`: endpoints for Vipps payments and payment agreements
- `/avtalegiro`: endpoints for Avtalegiro payments and payment agreements
- `/facebook`: endpoints for Facebook payments
- `/scheduled`: endpoints called by cron jobs (usually daily), mostly for processing recurring payments
- `/logging`: When we process recurring payments, we store some info. These endpoints fetch that info.
- `/mail`: endpoints for sending certain emails
- `/reports`: manual import data in bulk, via documents from banks or payment providers
- `/csr`: ?
- `/meta`: misc endpoints - today just one for data owners (Effekt and/or EAN)
- `/debug`: debugging endpoints
    
### Business logic
- `/handlers` holds request middleware (logging, errors) that triggers before/after requests.
- `/docs` holds additional documentation, and static image files for use in READMEs and documentation.
- `/__test__` holds tests.
- `/custom_modules` holds all the other logic! Core business logic, outbound gateways to remote endpoints, helper functions, and more. Some notable pieces:
  - `/custom_modules/DAO.js` and `/custom_modules/DAO_modules` holds all the code for interacting with the database (there's a good amount of business logic inside the specific DAO modules).
  - `/custom_modules/parsers` holds parsers for interpreting files, either manually uploaded, or pulled from FTP on a recurring basis.

### Authentication & Authorization

### KIDs
KIDs are unique identifiers for each used (donor, distribution percentages) combination. A new donation will reuse an existing KID if the right one already exists, otherwise a new KID will be generated. KIDs are important because they're the main thing we pass to the payment processor, and then they pass back to us along with a payment, so we know which donor that payment was for, and how we should distribute the money.

The code for creating a KID is in `/custom_modules/KID.js`.

The current way of generating it is a 15-digit number. The first 6 digits are donor ID (with leading 0s), then 8 random digits, then 1 checksum digit.

The old way of generating it was an 8-digit number, where the first 7 digits were random, and the last digit was a checksum digit.

### Data Access

### Email

### Logging

### Views

### Scheduled jobs

### Tests

## Database

We use MySQL for our primary database.

### Tables Overview

This section contains a brief overview of some of the most important database tables. First, a pretty picture of how the tables connect!

<img src="docs/table_relationships.png" width="1000" />

**Organizations**

The organizations we support donations to.

Main Columns
| Name        | Type   | Description | Example                      |
| ----------- | ------ | ----------- | ---------------------------- |
| `ID`        | int    |             | 1                            |
| `full_name` | string |             | "Against Malaria Foundation" |
| `abbriv`    | string |             | "AMF"                        |

**Donors**

One record for each donor. Personal info (name, ssn), credentials (email, password for users who can log in), and configuration.

Main Columns
| Name            | Type   | Description | Example             |
| --------------- | ------ | ----------- | ------------------- |
| `ID`            | int    |             | 2                   |
| `full_name`     | string |             | "Malcolm T. Madiba" |
| `ssn`           | string | Social Security Number            | 0123456789012       |
| `email`         | string |             | "x@z.org"           |
| `password_hash` | string |             |                     |
| `password_salt` | string |             |                     |
| `newsletter`    | bool   |             | true                |

**Payment**

One record for each payment type / payment processor, plus some metadata

Main Columns
| Name             | Type    | Description | Example |
| ---------------- | ------- | ----------- | ------- |
| `ID`             | int     |             | 3       |
| `payment_name`   | string  |             | "Vipps" |
| `flat_fee`       | decimal |             | 2.00    |
| `percentage_fee` | decimal |             | 1.50    |

**Donations**

One record for each donation.

Main Columns
| Name                 | Type    | Description                                                               | Example    |
| -------------------- | ------- | ------------------------------------------------------------------------- | ---------- |
| `ID`                 | int     |                                                                           | 4          |
| `Donor_ID`           | int     |                                                                           | 2          |
| `Payment_ID`         | int     |                                                                           | 3          |
| `PaymentExternal_ID` | string  | Payment ID in external system (ex: Vipps)                                 | "1351351"  |
| `sum_confirmed`      | decimal | donation amount (NOK)                                                     | 500.00     |
| `KID_fordeling`      | string  | Same as KID. Used to join to Combining_table for distribution percentages | "12345678" |

**Distribution**

One record for each (org, %) combination ever used.

Main Columns
| Name               | Type    | Description | Example |
| ------------------ | ------- | ----------- | ------- |
| `ID`               | int     |             | 5       |
| `OrgID`            | int     |             | 1       |
| `percentage_share` | decimal |             | 15.00   |

**Combining_table**

Join table to connect each KID to several Distributions. There will be multiple records for each KID with varying Distribution IDs. Percentage shares of the distributions for a given KID should sum to 100%.

Main Columns
| Name              | Type   | Description | Example    |
| ----------------- | ------ | ----------- | ---------- |
| `KID`             | string |             | "12345678" |
| `Donor_ID`        | int    |             | 1          |
| `Distribution_ID` | int    |             | 15.00      |

Example for donor 11 doing a one-time donation, and distributing 40% to AMF and 60% to GiveWell, which results in KID 1234:

Donations (1 record)
| ID   | Donor_ID | KID_fordeling |
| ---- | -------- | ------------- |
| 6332 | 11       | "1234"        |

Combining Table (2 records):
| KID    | Donor_ID | Distribution_ID |
| ------ | -------- | --------------- |
| "1234" | 11       | 511             |
| "1234" | 11       | 512             |

Distributions (2 records)
| ID  | OrgID | percentage_share |
| --- | ----- | ---------------- |
| 511 | 1     | 40.00            |
| 512 | 2     | 60.00            |

**A few other tables worth mentioning:**
- `Import_logs`: Auditing data recorded by scheduled document import jobs
- `Payment_intent`: Recorded when user starts a payment (but we aren't sure yet whether it'll be finalized)
- `Access_*`, `ChangePass`: for authn/authz
- `Referral_*`: for donor referrals
- `Avtalegiro_*`: Data synced from avtalegiro
- `Vipps_*`: Data synced from Vipps

### Schema and Migrations

Planned to onboard to a DB schema tool!

## Payment processing

### Bank

### Vipps

### PayPal

### Facebook