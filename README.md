## Effect Foundation API

The Effect Foundation API is used by all our core application for data storage. The API is connected to a MySQL database, where our donation data is stored. This includes our donations, donors, donation distributions, recurring donation agreements, referral statistics, authentification info, payment methods and so on.

The API is also responsible for handling payment processing.

---

**Table of contents**

- [Effect Foundation API](#effect-foundation-api)
- [API endpoints](#api-endpoints)
- [Get started developing](#get-started-developing)
  - [Clone and install packages](#clone-and-install-packages)
  - [Setup MySQL](#setup-mysql)
    - [Run MySQL locally (no Docker)](#run-mysql-locally-no-docker)
    - [Run MySQL locally (inside a Docker container)](#run-mysql-locally-inside-a-docker-container)
    - [Set up local Schema](#set-up-local-schema)
    - [Add test data to your local MySQL instance](#add-test-data-to-your-local-mysql-instance)
  - [Google Cloud & Cloud Sql Auth Proxy setup](#google-cloud--cloud-sql-auth-proxy-setup)
    - [Google Cloud access](#google-cloud-access)
    - [Google Cloud Sql Auth Proxy setup](#google-cloud-sql-auth-proxy-setup)
  - [Configuring and running the API](#configuring-and-running-the-api)
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
  - [Database Schema Migrations](#database-schema-migrations)
    - [Downloading production schema](#downloading-production-schema)
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

To run the API locally, follow these setup steps:

1. Clone and install packages
2. Setup MySQL

### Clone and install packages

Clone this repository to your local machine:

```
git clone https://github.com/stiftelsen-effekt/effekt-backend.git
```

> **Note** To clone the repository, you must have access and be part of the [Stiftelsen Effekt github organization](https://github.com/stiftelsen-effekt). You must also be logged in on git on your local machine. If you do not have access to clone the repository, enquire on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) channel.

The api uses [node.js](https://nodejs.org/en/) and npm is the package manager. 

#### Run API and test database with docker compose

First, follow instructions on the Docker website (or look for an online tutorial) to get Docker installed and running on your machine. 

If you're on Mac, it should be as easy as:

```
brew cask install docker
```

We use docker compose to setup the API and test database in separate containers. With docker in hand, it should be as simple as navigating to 

We can verify that the api is indeed operational by testing it in our browser. Navigation go http://localhost:3000 should yield a welcoming message.

<img src="docs/browser_root_route.png" width="500" />

If you need to connect the service to our production MySQL instance, first complete the Google Cloud SQL Auth Proxy setup above, then please enquire about these credentials on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) slack channel, and we will send them to you privately. We have two databases: `EffektDonasjonDB` and `EffektDonasjonDB_Dev`. The former is for our live production data, whilst the latter is for development.

If you wish to test restricted routes without having to authorize, you may also set `AUTH_REQUIRED` to false. More about [authorization](#authorization) is found in a latter section.

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

Routes are loaded into the app in [server.js](server.js), and that set of endpoints is assigned a url subpath:
```
app.use('/donors', donorsRoute)
```
By convention, each subpath will have its own file in `/routes` with the same name, for example url `/donors` is implemented in [/routes/donors.js](routes/donors.js)

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
| Name            | Type   | Description            | Example             |
| --------------- | ------ | ---------------------- | ------------------- |
| `ID`            | int    |                        | 2                   |
| `full_name`     | string |                        | "Malcolm T. Madiba" |
| `ssn`           | string | Social Security Number | 0123456789012       |
| `email`         | string |                        | "x@z.org"           |
| `password_hash` | string |                        |                     |
| `password_salt` | string |                        |                     |
| `newsletter`    | bool   |                        | true                |

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

### Database Schema Migrations

We use the db-migrate tool ([github](https://github.com/db-migrate/node-db-migrate)) ([docs](https://db-migrate.readthedocs.io/en/latest/)) to create and apply our database migrations.

Configuration for db-migrate is stored in [db/database.json](db/database.json), and the migration scripts are stored in [db/migrations](db/migrations).


With a locally running database, use

```
npx db-migrate up --config db/database.json --migrations-dir db/migrations
```

to apply all migrations. You may see a warning like `Ignoring invalid configuration option passed to Connection: driver. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration option to a Connection` when running the tool, this can be ignored.

Use

```
npx db-migrate down --config db/database.json --migrations-dir db/migrations
```

to unapply the latest migration. You will likely need to apply migrations somewhat frequently (whenever you git pull and there are new migration files).

db-migrate keeps track of which migrations have been applied in a "migrations" table inside your MySQL database. Each migration that's run gets its own entry.

Create a new set of 3 migration files (node script, upgrade sql file, downgrade sql file) using:

```
npx db-migrate create name-of-my-migration --sql-file --config db/database.json --migrations-dir db/migrations
```

You shouldn't need to touch the node script at all. You do need to manually craft the upgrade and downgrade SQL files. The upgrade file can be any SQL statement(s), the downgrade file should be a "revert" that brings the database back to the prior state. Some example file contents:

- add column (upgrade): `ALTER TABLE Donations ADD COLUMN doggo VARCHAR(20);`
- add column (downgrade): `ALTER TABLE Donations DROP COLUMN doggo;`
- add index (upgrade): `CREATE INDEX idx_donor_id ON Donations (Donor_ID);`
- add index (downgrade): `DROP INDEX idx_donor_id ON Donations;`

The process for updating production schema should be as follows. Usually you have a desired schema migration, and a corresponding code change that reads/writes the new fields:
1. Stash your code changes for later
2. Create your migration files
3. Run unit & manual tests first (don't apply the migration yet)
4. Apply the migration locally
5. Run unit & manual tests to ensure the service still runs properly with the DB schema change
6. Unapply then re-apply the migration to ensure migration down works properly.
7. Test it with your code change
8. Get code review (code + corresponding migration together is fine) and merge your change to main branch
9. (You or someone with access) apply the migration to production DB
10. Deploy the code relying on that migration to production DB

For maximum safety, to prevent cases where your code is accidentally deployed but the migration hasn't been run, you can also feel free to create two separate changesets, first the DB migration, and then your code using the new schema (and wait until the migration has been applied to the production DB before merging your code to main).

To actually apply a migration to production, ensure Cloud Sql Auth Proxy is running, then use the following command:

```
DB_USER='<produser>' DB_PASS='<prodpassword>' npx db-migrate up -c 1 -e prod --config db/database.json --migrations-dir db/migrations
```

You can instead do `-e dev` to apply migrations against EffektDonasjonDB_Dev.

#### Downloading production schema

This shouldn't be needed often. Usually we should be able to stick with the existing schema snapshot and set of migration files. But if we get too many migration files, it might be nice to delete them and put in a new schema snapshot as a starting point.

Set up Cloud Sql Auth Proxy, then run:

```
mysqldump -h 127.0.0.1 -u'<produser>' -p'<prodpassword>' --no-data --triggers --routines --events --set-gtid-purged=OFF EffektDonasjonDB > db/prod_schema.sql
```

## Payment processing

### Bank

### Vipps

### PayPal

### Facebook