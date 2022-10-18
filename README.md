<p align="center">
  <img 
    src="docs/logo.svg"
    alt="Gi Effektivt logo"
    width="340" />
</p>

[![Open API documentation](https://img.shields.io/badge/Open%20API%20Documentation-1.0.0-blue)](https://data.gieffektivt.no/)
![GitHub branch checks state](https://img.shields.io/github/checks-status/stiftelsen-effekt/effekt-backend/master)
![Snyk Vulnerabilities for GitHub Repo](https://img.shields.io/snyk/vulnerabilities/github/stiftelsen-effekt/effekt-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Gi Effektivt API

The Gi Effektivt API is used by all our core application for data storage. The API is connected to a MySQL database, where our donation data is stored. This includes our donations, donors, donation distributions, recurring donation agreements, referral statistics, authentification info, payment methods and so on.

The API is also responsible for handling payment processing.

---

**Table of contents**

- [Get started developing](#get-started-developing)
  - [Run API and test database with docker compose](#run-api-and-test-database-with-docker-compose)
  - [Running commands in container](#running-commands-in-container)
  - [Testing](#testing)
- [Build and deployment](#build-and-deployment)
  - [Environments](#environments)
- [Database Schema Migrations](#database-schema-migrations)
  - [Creating and applyting migrations](#creating-and-applyting-migrations)
  - [Rolling back](#rolling-back)
  - [Migration pipeline](#migration-pipeline)
  - [Downloading production schema](#downloading-production-schema)
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
  - [Tables Overview](#tables-overview)

---

## Get started developing

Clone this repository to your local machine:

```
git clone https://github.com/stiftelsen-effekt/effekt-backend.git
```

> **Note** To clone the repository, you must have access and be part of the [Stiftelsen Effekt github organization](https://github.com/stiftelsen-effekt). You must also be logged in on git on your local machine. If you do not have access to clone the repository, enquire on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) channel.

### Run API and test database with docker compose

First, follow instructions on the Docker website (or look for an online tutorial) to get Docker installed and running on your machine.

If you're on Mac, it should be as easy as:

```
brew cask install docker
```

We use docker compose to setup the API and test database in separate containers. With docker in hand, it should be as simple as navigating to the root in your terminal of choice, and running

```
docker compsose up
```

We can verify that the api is indeed operational by testing it in our browser. Navigation go http://localhost:5050 should yield a welcoming message.

<img src="docs/browser_root_route.png" width="500" />

### Running commands in container

In general, if you want to run commands in the docker container, you may use the following format

```
docker container exec -it effekt-backend-api-1 your_commands_here
```

Note that `effekt-backend-api-1` is the name of the container. This is the name it gets by default, but it might differ on your machine.

### Running tests

We use mocha for our unit tests. To run the test suite, use the command

```
docker container exec -it effekt-backend-api-1 npm run test
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

## Database migrations

Database migrations are changes to the schema or data in our database. When developing localy, we are dealing with test data. All changes to the schema or data should be provided as migration files, with both an **up** component and a **down** component. The up component specifies which changes are made, and the down component reverses the changes. This is an example of a database migration file.

```sql
-- migrate:up
ALTER TABLE Donations ADD COLUMN doggo VARCHAR(20);

-- migrate:down
ALTER TABLE Donations DROP COLUMN doggo;
```

We use the tool [dmate](https://github.com/amacneil/dbmate) to handle migrations. It keeps track of migrations for us. The tool is already installed in the local docker container for the backend. To apply all existing migrations we run

```bash
docker container exec -it effekt-backend-api-1 dbmate up
```

where `effekt-backend-api-1` is the name of the running container. This will make sure the database is in the most up to date state.

### Creating and applyting migrations

To create a new migration we run

```bash
docker container exec -it effekt-backend-api-1 dbmate new your_name_here
```

This will result in a new migration file in the folder `/db/migrations` which will be named and timestamped. It will be empty, and you fill in whatever SQL code you which the migration to execute.

```sql
-- migrate:up
-- Your SQL for the changes

-- migrate:down
-- Your SQL for reversing the changes
```

To apply the migration you just created to the database, you run the `dbmate up` command again.

### Rolling back

Rolling back changes is done in a similar way, with `dbmate down` or `dbmate rollback`. This will rollback the latest migration.

```bash
docker container exec -it effekt-backend-api-1 dbmate down
```

### Migration pipeline

Having created and tested all your migrations, include the migrations in source control. When creating a pull request the build pipeline will

1. Build the application and database
2. Run all the tests
3. If all the tests proceed, the build will be marked as passing

If the PR is merged into master the pipeline will then preform the same steps in addition to applying the migrations to the production database. The application will then be deployed to production, and the backend and database should be in sync.

### Downloading production schema

If you need access to the production schema or production data, please contact the [administration](https://gieffektivt.no/about) or inquire on slack.

## Code Structure & Implementation Details

### Routes

Routes in `/routes` define which API endpoints exist, and what they do. They're roughly broken into files (and corresponding url sub-paths) by grouped functionality.

Routes are loaded into the app in [server.js](server.js), and that set of endpoints is assigned a url subpath:

```
app.use('/donors', donorsRoute)
```

By convention, each subpath will have its own file in `/routes` with the same name, for example url `/donors` is implemented in [/routes/donors.ts](routes/donors.ts)

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
  - [/custom_modules/DAO.js](/custom_modules/DAO.js) and `/custom_modules/DAO_modules` holds all the code for interacting with the database (there's a good amount of business logic inside the specific DAO modules).
  - `/custom_modules/parsers` holds parsers for interpreting files, either manually uploaded, or pulled from FTP on a recurring basis.

### Authentication & Authorization

### KIDs

KIDs are unique identifiers for each used (donor, distribution percentages) combination. A new donation will reuse an existing KID if the right one already exists, otherwise a new KID will be generated. KIDs are important because they're the main thing we pass to the payment processor, and then they pass back to us along with a payment, so we know which donor that payment was for, and how we should distribute the money.

The code for creating a KID is in [/custom_modules/KID.js](custom_modules/KID.js).

The current way of generating it is a 15-digit number. The first 6 digits are donor ID (with leading 0s), then 8 random digits, then 1 checksum digit.

The old way of generating it was an 8-digit number, where the first 7 digits were random, and the last digit was a checksum digit.

### Data Access

### Email

### Logging

### Views

### Scheduled jobs

### Tests

### Tables Overview

This section contains a brief overview of some of the most important database tables. First, a pretty picture of how the tables connect!

<img src="docs/table_relationships.png" width="1000" />

**Organizations**

The organizations we support donations to.

Main Columns
| Name | Type | Description | Example |
| ----------- | ------ | ----------- | ---------------------------- |
| `ID` | int | | 1 |
| `full_name` | string | | "Against Malaria Foundation" |
| `abbriv` | string | | "AMF" |

**Donors**

One record for each donor. Personal info (name, ssn), credentials (email, password for users who can log in), and configuration.

Main Columns
| Name | Type | Description | Example |
| --------------- | ------ | ---------------------- | ------------------- |
| `ID` | int | | 2 |
| `full_name` | string | | "Malcolm T. Madiba" |
| `ssn` | string | Social Security Number | 0123456789012 |
| `email` | string | | "x@z.org" |
| `password_hash` | string | | |
| `password_salt` | string | | |
| `newsletter` | bool | | true |

**Payment**

One record for each payment type / payment processor, plus some metadata

Main Columns
| Name | Type | Description | Example |
| ---------------- | ------- | ----------- | ------- |
| `ID` | int | | 3 |
| `payment_name` | string | | "Vipps" |
| `flat_fee` | decimal | | 2.00 |
| `percentage_fee` | decimal | | 1.50 |

**Donations**

One record for each donation.

Main Columns
| Name | Type | Description | Example |
| -------------------- | ------- | ------------------------------------------------------------------------- | ---------- |
| `ID` | int | | 4 |
| `Donor_ID` | int | | 2 |
| `Payment_ID` | int | | 3 |
| `PaymentExternal_ID` | string | Payment ID in external system (ex: Vipps) | "1351351" |
| `sum_confirmed` | decimal | donation amount (NOK) | 500.00 |
| `KID_fordeling` | string | Same as KID. Used to join to Combining_table for distribution percentages | "12345678" |

**Distribution**

One record for each (org, %) combination ever used.

Main Columns
| Name | Type | Description | Example |
| ------------------ | ------- | ----------- | ------- |
| `ID` | int | | 5 |
| `OrgID` | int | | 1 |
| `percentage_share` | decimal | | 15.00 |

**Combining_table**

Join table to connect each KID to several Distributions. There will be multiple records for each KID with varying Distribution IDs. Percentage shares of the distributions for a given KID should sum to 100%.

Main Columns
| Name | Type | Description | Example |
| ----------------- | ------ | ----------- | ---------- |
| `KID` | string | | "12345678" |
| `Donor_ID` | int | | 1 |
| `Distribution_ID` | int | | 15.00 |

Example for donor 11 doing a one-time donation, and distributing 40% to AMF and 60% to GiveWell, which results in KID 1234:

Donations (1 record)
| ID | Donor_ID | KID_fordeling |
| ---- | -------- | ------------- |
| 6332 | 11 | "1234" |

Combining Table (2 records):
| KID | Donor_ID | Distribution_ID |
| ------ | -------- | --------------- |
| "1234" | 11 | 511 |
| "1234" | 11 | 512 |

Distributions (2 records)
| ID | OrgID | percentage_share |
| --- | ----- | ---------------- |
| 511 | 1 | 40.00 |
| 512 | 2 | 60.00 |

**A few other tables worth mentioning:**

- `Import_logs`: Auditing data recorded by scheduled document import jobs
- `Payment_intent`: Recorded when user starts a payment (but we aren't sure yet whether it'll be finalized)
- `Referral_*`: for donor referrals
- `Avtalegiro_*`: Data synced from avtalegiro
- `Vipps_*`: Data synced from Vipps
