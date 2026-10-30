## Effect Foundation API

The Effect Foundation API is used by all our core application for data storage. The API is connected to a MySQL database, where our donation data is stored. This includes our donations, donors, donation distributions, recurring donation agreements, referral statistics, authentification info, payment methods and so on.

The API is also responsible for handling payment processing.

## Local environment

One command runs the API and the new admin with a seeded MySQL and a local OIDC issuer in Docker. The admin is on http://localhost:3001 (already signed in as an admin), the API on http://localhost:5050. Nothing touches Auth0 or any staging/production resource, and all third-party integrations are blank ([`.env.docker`](.env.docker)). Requires Docker.

```bash
pnpm dev:env:up       # build + start db, auth, migrate+seed, api, admin; waits until healthy
pnpm -s dev:token     # admin access token (all permissions)
pnpm -s dev:token -- --donor 27   # non-admin token for donor 27
pnpm dev:env:logs     # follow API logs
pnpm dev:env:down     # stop (keeps the database)
pnpm dev:env:reset    # wipe the database, re-migrate and re-seed
pnpm dev:data:topup   # bring the generated data up to today (needs the env running)
```

```bash
curl localhost:5050/causeareas/active
curl -X POST localhost:5050/donors/list/ -H "Authorization: Bearer $(pnpm -s dev:token)" \
  -H 'content-type: application/json' -d '{"page":0,"limit":5,"filter":null}'
```

- API on `localhost:5050` (nodemon; edits under `src/` reload). MySQL on `localhost:3307` (`root` / `effekt-local`, database `EffektDonasjonDB_Local`). Issuer on `localhost:8090/effekt`. Override ports with `DEV_API_PORT`, `DEV_DB_PORT`, `DEV_AUTH_PORT`.
- The database is filled with generated fake data that ends **today**: five years of donations with growth, December peaks, AvtaleGiro claims (a few missing every day), Vipps agreements and charges, fundraisers, import logs and a handful of open review queue items. The shape (volumes, payment method mix, amounts, statuses, churn) follows rounded production aggregates recorded in [`prisma/devdata/config.ts`](prisma/devdata/config.ts); all people, emails (`example.org`/`.com`/`.net`) and national ids (synthetic Tenor numbers) are fake. Seeding takes a few seconds.
- **Regranting:** the data also has years of regranting history ([`prisma/devdata/regranting.ts`](prisma/devdata/regranting.ts), design in [`docs/regranting.md`](docs/regranting.md)): a paid regular round every three months, the last with its cutoff about three months before the seed day, so a new regular round opened today has realistic amounts to propose; major-donor rounds, an extraordinary round paid before the donation arrived (`fronted`), off-schedule and yearly grants from the own fund GEBF, payees and dated routings (Malaria Consortium moved from GiveWell to direct), GiveDirectly projects, holds, and every adjustment type. One approved, unpaid major-donor round and one fund-grant draft are left open. Rounds are built with the backend's own proposal and validation rules from the generated donations, staff are fake `@example.org` addresses. Nothing is scheduled after the seed day: top-ups add donations but no rounds, so new rounds are yours to run in the admin.
- **Pledges (tilsagn)** for the analysis overview: four open pledges of different sizes and ages (one partly paid, its sum lowered to what remains), two received ones linked to the bank donation that fulfilled them and one received without a link. Open pledges are never closed by a top-up.
- **Keeping it current:** every `pnpm dev:env:up` tops the data up with the days since it was generated (or since the last top-up), so "this month", the AvtaleGiro check and the charge lists always look like a live system. Records you created or edited by hand are kept: the top-up only inserts new generated rows (above the highest existing ids) and updates the state columns of generated rows that changed in the meantime (agreement cancelled, charge charged, review item handled). Run `pnpm dev:data:topup` to do the same without restarting. If the generator itself has changed since the database was seeded, the top-up says so and leaves the data alone; run `pnpm dev:env:reset`.
- Generator knobs (environment variables for `prisma db seed` / the top-up): `SEED_NOW=2026-10-27` pretends today is another day (reproducible snapshots), `SEED_SCALE=0.5` halves all volumes, `SEED` changes the random seed. The seed's settings and id mapping are kept in a separate `dev_seed_meta` schema, so Prisma never sees an extra table.
- Token claims are configured in [`compose.dev.yml`](compose.dev.yml) (`auth` service). The issuer is taken from the `Host` header, so tokens must be requested with `Host: auth:8080`; [`scripts/dev-token.sh`](scripts/dev-token.sh) does this.
- Changes to `package.json` or `prisma/schema.prisma` need a rebuild: run `pnpm dev:env:up` again.

---

**Table of contents**

- [Effect Foundation API](#effect-foundation-api)
- [Local environment](#local-environment)
- [API endpoints](#api-endpoints)
- [Get started developing](#get-started-developing)
  - [Clone repository](#clone-repository)
  - [Bring up your environment](#bring-up-your-environment)
  - [Install packages](#install-packages)
  - [Setup MySQL](#setup-mysql)
    - [Run MySQL locally (no Docker)](#run-mysql-locally-no-docker)
    - [Run MySQL locally (inside a Docker container)](#run-mysql-locally-inside-a-docker-container)
    - [Set up local Schema](#set-up-local-schema)
    - [View the Database with GUI](#view-the-database-with-gui)
    - [Add test data to your local MySQL instance](#add-test-data-to-your-local-mysql-instance)
  - [Connect to Production Database: Google Cloud \& Cloud Sql Auth Proxy setup](#connect-to-production-database-google-cloud--cloud-sql-auth-proxy-setup)
    - [Google Cloud access](#google-cloud-access)
    - [Google Cloud Sql Auth Proxy setup](#google-cloud-sql-auth-proxy-setup)
  - [Running the API](#running-the-api)
  - [Testing](#testing)
- [Build and deployment](#build-and-deployment)
  - [Environments](#environments)
  - [Google cloud build](#google-cloud-build)
- [Code Structure \& Implementation Details](#code-structure--implementation-details)
  - [Routes](#routes)
  - [Business logic](#business-logic)
  - [Authentication \& Authorization](#authentication--authorization)
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
    - [Migration job](#migration-job)
- [Payment processing](#payment-processing)
  - [Bank](#bank)
  - [Vipps](#vipps)
  - [Facebook](#facebook)
  - [Swish](#swish)

---

## API endpoints

Our API endpoints are described in the swagger documentation available [here (production)](https://data.gieffektivt.no/api-docs/) or [here (development)](https://dev.data.gieffektivt.no/api-docs/)).

We are currently working on improving this documentation.

## Get started developing

To run the API locally, follow these setup steps:

1. [Clone Repository](#clone-repository)
2. [Bring up your environment](#bring-up-your-environment)
3. [Install packages](#install-packages)
4. [Setup MySQL](#setup-mysql)

### Clone repository

Clone this repository to your local machine:

```sh
git clone https://github.com/stiftelsen-effekt/effekt-platform.git
```

> **Note** To clone the repository, you must have access and be part of the [Stiftelsen Effekt github organization](https://github.com/stiftelsen-effekt). You must also be logged in on git on your local machine. If you do not have access to clone the repository, enquire on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) channel.

### Bring up your environment

To get started, make a copy of `.env.example` and name it `.env`. The values in this file will automatically be picked up by the node.js application and the file will not be added to source control so it is okay to have secret values in there.

```sh
cp .env.example .env
```

Open the .env file and update the variables with your own values:

- `DB_USER` (name of database user)
- `DB_PASS` (password of database user)
- `DB_NAME` (name of MySQL instance)

The other configuration variables are only needed to run specific parts of the code, such as payment processing or mail processing.

### Install packages

The api uses [node.js](https://nodejs.org/en/) and [pnpm](https://pnpm.io/) is the package manager (`corepack enable` picks the pinned version). The repo is a pnpm workspace: the backend at the root and the admin in `admin/`. Packages are hard-linked from pnpm's global store, so extra worktrees cost almost no disk. Go to the root folder of the cloned repository, and install the requisite packages with the command:

```sh
npm install
```

### Setup MySQL

There are three options for setting up MySQL for your local API service to connect to:

1. [Run MySQL locally (no Docker)](#run-mysql-locally-no-docker)
2. [Run MySQL locally (inside a Docker container)](#run-mysql-locally-inside-a-docker-container)
3. [Connect to the production database](#connect-to-production-database-google-cloud--cloud-sql-auth-proxy-setup)

Strongly prefer running locally (either with or without a Docker container), rather than connecting to the production database. It's easier to set up, and way safer - no chance of leaking personal info of our users, and no chance of writing invalid data to the production database.

Running locally is the easiest option if this is the only use for MySQL on your machine. Running locally inside Docker is a bit more difficult to set up and a bit more resource-intensive for your machine, but helps with isolation.

In any of the approaches, we're going to expose MySQL on the default MySQL port of 3306.

**Quick setup example**: If you got Docker Compose installed the entire setup of MySQL can be done with

```sh
docker compose up -d # Sets up MySQL and the database: EffektDonasjonDB_Local
```

then:

```sh
pnpm exec prisma migrate reset # Migrates schemas and tables to the database
pnpm exec prisma db seed       # Seeds test-data
```

Read on if you are unfamiliar with these commands.

#### Run MySQL locally (no Docker)

First, install MySQL using one of the below commands (or look for installation instructions online).

If you use brew, installing MySQL is as easy as:

```sh
brew install mysql
```

On Windows, you can install with Chocolatey:

```sh
choco install mysql
```

The default user is `root`, let's set a password of `effekt`:

```sh
mysql -h 127.0.0.1 -uroot -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'effekt'; flush privileges;"
```

Now we can log in to the MySQL command prompt with:

```sh
mysql -h 127.0.0.1 -uroot -peffekt
```

On Mac or Linux, you can start MySQL with `mysql.server start` (and stop it with `mysql.server stop` if you want).

As the last step, create the local database named `EffektDonasjonDB_Local` with:

```sh
mysql -h 127.0.0.1 -uroot -peffekt -e 'create database EffektDonasjonDB_Local'
```

#### Run MySQL locally (inside a Docker container)

First, follow instructions on the Docker website (or look for an online tutorial) to get Docker installed and running on your machine.

If you're on Mac, it should be as easy as:

```sh
brew cask install docker
```

Then run:

```sh
docker run -d \
--name effekt-mysql \
-p 3306:3306 \
-e MYSQL_ROOT_PASSWORD=effekt \
-e MYSQL_DATABASE=EffektDonasjonDB_Local \
-v effekt-mysql_volume:/var/lib/mysql \
mysql:latest
```

Or if you want to use docker compose (installed with Docker Desktop) run this command from the project root directory:

```sh
docker compose up -d
```

This creates and runs a new Docker container named `effekt-mysql`, runs MySQL inside the container and creates the database `EffektDonasjonDB_Local`. The default user is `root` with password `effekt`. It also sets up port forwarding, so your local port 3306 gets forwarded to port 3306 inside your Docker container (where MySQL is running).

The `-v  effekt-mysql_volume:/var/lib/mysql` command attachs a named volume for persistent storage of your database (even if you remove the container). You can safely remove this you want to reset everything when removing the container.

Now we can log in to the MySQL command prompt with:

```sh
docker exec -it effekt-mysql mysql -h 127.0.0.1 -peffekt
```

_Some basic Docker commands:_

- `docker ps` to list all currently-running containers
- `docker stop effekt-mysql` to stop the container
- `docker start effekt-mysql` to start the container
- `docker rm effekt-mysql` to remove the container
- `docker logs effekt-mysql` to view the logs
- `docker exec -it effekt-mysql /bin/bash` to enter the container shell
- `docker volume ls` to list volumes used by docker
- `docker volume rm effekt-mysql-volume` to remove the named volume

#### Set up local Schema

Now we want to set up the database to mirror production. First schema, then with some production-like data to develop against. Whether you're running MySQL natively or inside a Docker container, the steps are the same.

Ensure you have created a database named `EffektDonasjonDB_Local`. You can check with:

```sh
mysql -h 127.0.0.1 -uroot -peffekt EffektDonasjonDB_Local -e 'SHOW DATABASES;'
```

The schema is defined by prisma in [prisma/schema.prisma](prisma/schema.prisma). Prisma is a tool that generates a database schema from this file, and also generates a node.js client for interacting with the database. To begin with, you should run the existing migrations to setup your local database:

```sh
pnpm exec prisma migrate reset
pnpm exec prisma db seed
```

Leave out `prisma db seed` if you want the database to be empty (since Prisma 7, `migrate reset` no longer seeds).

Now, let's double check that the schema is correct! Try:

```sh
mysql -h 127.0.0.1 -uroot -peffekt EffektDonasjonDB_Local -e 'show tables'
```

you should see output like:

```sql
+-----------------------------------+
| Tables_in_EffektDonasjonDB_Local  |
+-----------------------------------+
| _prisma_migrations                |
| Auth0_users                       |
| Avtalegiro_agreements             |
| Avtalegiro_conversion_reminders   |
...
```

and when you run:

```sh
mysql -h 127.0.0.1 -uroot -peffekt EffektDonasjonDB_Local -e 'describe Donations'
```

you should see output like:

```sql
+---------------------+------------------------+------+-----+-------------------+-------------------+
| Field               | Type                   | Null | Key | Default           | Extra             |
+---------------------+------------------------+------+-----+-------------------+-------------------+
| ID                  | int                    | NO   | PRI | NULL              | auto_increment    |
| Donor_ID            | int                    | NO   | MUL | NULL              |                   |
| Payment_ID          | int                    | NO   | MUL | NULL              |                   |
| PaymentExternal_ID  | varchar(32)            | YES  | UNI | NULL              |                   |
...
```

#### View the Database with GUI

You can also view the database with `Prisma Studio`, a GUI of the database via. the browser (the default address is <http://localhost:5555>):

```sh
pnpm exec prisma studio
```

Alternatively download and connect with a visual database tool like `MySQL Workbench`.

#### Add test data to your local MySQL instance

Test data is seeded with `pnpm exec prisma db seed` (since Prisma 7, `migrate reset` and `migrate dev` no longer seed). [seed.ts](/prisma/seed.ts) generates it with the deterministic generator in [prisma/devdata](/prisma/devdata/) (see [Local environment](#local-environment)); it refuses to run against a database that already has donors. To seed an empty database:

```sh
pnpm exec prisma db seed
```

To bring a database seeded this way up to today later, without losing what you added:

```sh
DB_URL=mysql://user:password@localhost:3306/database pnpm exec ts-node prisma/devdata/topup.ts
```

The volumes and distributions are tuned in [prisma/devdata/config.ts](/prisma/devdata/config.ts).

You can also manually add test-data with a graphical tool like [`Prisma Studio` etc.](#view-the-database-with-gui)

Or, of course, also use `mysql` queries like `INSERT` etc. to manipulate the database.

### Connect to Production Database: Google Cloud & Cloud Sql Auth Proxy setup

Most developers hopefully do not need to access the production MySQL instance for day-to-day development.

If you do need to access the production database, you'll use Google Cloud SQL Auth Proxy - it's a tool that sets up a tunnel from your machine to our production MySQL instance. Once you've finished setting it up, you'll be able to connect with the MySQL command prompt, a MySQL GUI, or connect using your locally-running Effekt Backend service.

#### Google Cloud access

First, make sure you have a google cloud account, and get someone in the team to authorize you with the SQL client privilege.

#### Google Cloud Sql Auth Proxy setup

First, follow setup instructions at https://cloud.google.com/sql/docs/mysql/connect-admin-proxy

The instance name of our database is `hidden-display-243419:europe-north1:effekt-db`. Thus, the command to setup the proxy is:

```sh
./cloud_sql_proxy hidden-display-243419:europe-north1:effekt-db
```

if cloud_sql_proxy is located in the same folder in your terminal. We recommend you store the binary somewhere on your computer, and add it to your path.

It's also possible to create an alias on macos / linux to avoid having to type in the entire command each time you wish to connect.

If all has gone well, you should be seeing this in your terminal of choice.

<img src="docs/sql_proxy_terminal.png" width="500" />

The proxy is now listening for connections on port 3306 (the standard mysql port), and forwards any communication to the internal google cloud network through a secure tunnel.

### Running the API

Let's run the service, using our locally-running MySQL instance (either native or in Docker):

```sh
pnpm start
```

If all goes well, you should be seeing something like this in your terminal

<img src="docs/api_terminal.png" width="500" />

We can verify that the api is indeed operational by testing it in our browser. Navigation go http://localhost:5050 should redirect you to http://localhost:5050/api-docs/ shownig the API documentation

If you need to connect the service to our production MySQL instance, first complete the Google Cloud SQL Auth Proxy setup above, then please enquire about these credentials on our [tech](https://effektteam.slack.com/archives/G011BE3BG3H) slack channel, and we will send them to you privately. We have two databases: `EffektDonasjonDB` and `EffektDonasjonDB_Dev`. The former is for our live production data, whilst the latter is for development.

If you wish to test restricted routes without having to authorize, you may also set `AUTH_REQUIRED` to false. More about [authorization](#authorization) is found in a latter section.

### Testing

We use mocha for our unit tests. To run the test suite, use the command

```sh
pnpm test
```

which will yield something like this

<img src="docs/tests_terminal.png" width="500" />

## Build and deployment

Merges to `main` deploy to production through Cloud Build:

| What    | Trigger                                 | Deploys                                                     |
| ------- | --------------------------------------- | ----------------------------------------------------------- |
| Backend | `BackendDeploy` (`cloud.deploy.yaml`)   | https://data.gieffektivt.no (migrate, then Cloud Run)       |
| Admin   | `AdminDeploy` (`cloudbuild.admin.yaml`) | https://admin.gieffektivt.no (only when admin files change) |
| Website | Vercel (`apps/web`)                     | gieffektivt.no, giveffektivt.dk, geeffektivt.se             |

Every other branch gets the `QualityAssurance` build (`cloud.qa.yaml`) as a required check.
PRs with the `preview` label get a preview environment ([docs/preview-environments.md](docs/preview-environments.md)).
There is no separate dev or stage environment.

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

We're using prisma to manage database schema migrations. The schema is defined in [/prisma/schema.prisma](prisma/schema.prisma). To apply the schema locally, run

```sh
pnpm exec prisma db push
```

This is useful while developing locally. Once you're ready to make a migration file, run

```sh
pnpm exec prisma migrate dev --name <migration-name>
```

This will create a new migration file in [/prisma/migrations](prisma/migrations).

The migrations are run automatically in our CI/CD pipeline as part of the deployment flow.

It is generally advised to use the [expand and contract pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern) when making changes to the database schema. This means that you first add the new column, then migrate the code to use the new column, then remove the old column. This ensures that the code is always compatible with the database schema.

#### Migration job

The migrations are run in Cloud Run Job, similarly to what is described [here](https://cloud.google.com/blog/topics/developers-practitioners/running-database-migrations-cloud-run-jobs) (except not using Procfile)

The CI/CD pipeline is only executing the jobs. The jobs have to be created manually for each environment. These are the steps to create a job for a specific environment:

1. Create a secret for the DB url if one doesn't already exist for that environment
1. Replace the placeholder values and run the `gcloud` command

```sh
gcloud run jobs create <SERVICE_NAME>-db-migrate \
  --image gcr.io/<PROJECT_ID>/<IMAGE_NAME>:latest \
  --set-secrets DB_URL=<SERVICE_NAME>-db-url:latest \
  --set-cloudsql-instances <PROJECT_ID>:europe-north1:<CLOUD_SQL_NAME> \
  --region europe-north1 \
  --max-retries 0 \
  --command "./node_modules/.bin/prisma" \
  --args "migrate,deploy"
```

## Payment processing

### Bank

### Vipps

🇳🇴

> ❗ **NOK only**

### Facebook

### Swish

🇸🇪

> ❗ **SEK only**

> ❗ **One-time donations only**

Read more about Swish [here](https://www.swish.nu/).
