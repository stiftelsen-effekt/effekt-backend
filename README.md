# Effect Foundation API

The Effect Foundation API is used by all our core application for data storage. The API is connected to a MySQL database, where our donation data is stored. This includes our donations, donors, donation distributions, recurring donation agreements, referral statistics, authentification info, payment methods and so on.

The API is also responsible for handling payment processing.

---

**Table of contents**

* [API endpoints](#api-endpoints)
* [Get started developing](#get-started-developing)
  * [Google cloud setup](#google-cloud-setup)
  * [Google cloud sql auth proxy](#google-cloud-sql-auth-proxy)
  * [Configuring the API](#configuring-the-api)
  * [Installing packages and running the project](#installing-packages-and-running-the-project)
  * [Testing](#testing)
* [Build and deployment](#build-and-deployment)
  * [Environments](#environments)
  * [Google cloud build](#google-cloud-build)
* [Authentification](#authentification)
* [Code structure](#code-structure)
  * [Routes](#routes)
  * [Business logic](#business-logic)
  * [Data Access](#data-access)
  * [Email](#email)
  * [Logging](#logging)
  * [Views](#views)
  * [Scheduled jobs](#scheduled-jobs)
* [Payment processing](#payment-processing)
  * [Bank](#bank)
  * [Vipps](#vipps)
  * [PayPal](#paypal)

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

|Branch|Url|Database|Environment variables|
|-|-|-|-|
|`Master`|https://data.gieffektivt.no|`EffektDonasjonDB`|Production|
|`Stage`|https://stage.data.gieffektivt.no|`EffektDonasjonDB`|Production|
|`Dev`|https://dev.data.gieffektivt.no|`EffektDonasjonDB_Dev`|Development|

### Google cloud build

## Authentification

## Code structure

### Routes

### Business logic

### Data Access

### Email

### Logging

### Views

### Scheduled jobs

## Payment processing

### Bank

### Vipps

### PayPal