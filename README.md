# SmartRentBoss

SmartRentBoss is a small web app for landlords in Ontario who look after about 1 to 10 units. You can sign up, add a property, add the units in that property, and record who is renting each unit, for how much, and which day the rent is due.

Each login sees only its own buildings and tenants.

This copy of the app runs on your computer. You do not need to know Git to try it.

## What you need installed

Install these two programs, then reopen your terminal so it can find them.

1. **Node.js 22.** Download the installer from [https://nodejs.org](https://nodejs.org). Choose the current LTS (long-term support) version.
2. **Docker Desktop.** Download it from [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/). After it installs, open Docker Desktop and wait until it says it is running. Docker runs the Postgres database for you.

Check Node from a terminal:

```bash
node -v
```

You should see a version starting with `v22` (v20.9 or newer also works).

## Get the project onto your computer

**If you have never used Git,** use the ZIP file:

1. Open this repository on GitHub.
2. Click the green **Code** button.
3. Click **Download ZIP**.
4. Unzip the file.
5. Open a terminal in that unzipped folder. On macOS, you can drag the folder onto the Terminal icon. On Windows, open the folder in File Explorer, click the address bar, type `cmd`, and press Enter.

**If you use Git,** clone the repository and move into the folder:

```bash
git clone https://github.com/alagiriruban-alt/Smartrent.git
cd Smartrent
```

The rest of the commands below are run from that project folder. Your prompt should show the folder name before you continue.

## Start the app

Run these commands in order. Do not skip one.

### 1. Create the settings file

macOS or Linux:

```bash
cp .env.example .env
```

Windows Command Prompt:

```bash
copy .env.example .env
```

The file `.env` holds the database password and a secret used to sign login cookies. The sample values are fine while the app is only on your computer. Do not commit `.env` to GitHub. It is already listed in `.gitignore`.

### 2. Start the database

```bash
docker compose up -d
```

That starts Postgres in the background and creates a database named `smartrentboss`. The first run downloads the Postgres image, so it can take a minute.

### 3. Install the app and create the tables

```bash
npm install
npx prisma migrate deploy
npm run db:seed
```

`npm install` downloads the code libraries. `prisma migrate deploy` creates the tables. `npm run db:seed` adds one sample landlord so you can sign in right away.

### 4. Open the app

```bash
npm run dev
```

When the terminal says the app is ready, open [http://localhost:3000](http://localhost:3000) in your browser.

Leave that terminal open while you use the app. To stop the app, click the terminal and press `Ctrl+C`.

To stop the database later:

```bash
docker compose stop
```

## Sign in

The sample landlord created by the seed command is:

- Email: `landlord@example.com`
- Password: `DemoRent1`

You will see a duplex in Hamilton. The upper unit is rented. The lower unit is vacant. You can also create your own account from the home page. A new account starts with an empty rent roll and cannot see the sample landlord's data.

## What you can do

- Create an account, sign in, and log out.
- Add, edit, and delete a property. The province starts as Ontario.
- Add, edit, and delete units on that property.
- Add, edit, and remove a tenant on a unit, including the lease dates, monthly rent in Canadian dollars, the day rent is due, and optional email and phone.
- Read a rent roll that shows, for each property, how many units are occupied and the monthly rent from leases that are active today (America/Toronto).

Passwords are stored as a hash. The app never keeps the original password.

## Checks

From the project folder:

```bash
npm test
npm run lint
```

`npm test` runs the automated checks for rent totals, dates, postal codes, and form rules. `npm run lint` looks for common coding mistakes.

## If something goes wrong

**`node` is not recognized.** Install Node.js, close the terminal, and open a new one.

**`docker` is not recognized, or Docker says it cannot connect.** Open Docker Desktop and wait until it is running, then run `docker compose up -d` again.

**Port 5432 is already in use.** Another Postgres is running on your computer. Stop that program, or change the port in `docker-compose.yml` and the port in `DATABASE_URL` inside `.env` so they match.

**Prisma says it cannot reach the database.** The database is not running. From the project folder, run `docker compose up -d`, wait a few seconds, and run `npx prisma migrate deploy` again.

**Sign-in says the email or password is incorrect.** Run `npm run db:seed` again, then use `landlord@example.com` and `DemoRent1`. The password is case-sensitive.

**The page in the browser will not load.** Make sure `npm run dev` is still running and you opened `http://localhost:3000`.

## Without Docker

If you already have PostgreSQL 16 installed, you can skip Docker. Create the same user and database, then continue from `npm install`.

```bash
createuser -P smartrent
createdb -O smartrent smartrentboss
```

When it asks for a password, enter `smartrent`. If you choose a different password, put that password in `DATABASE_URL` in `.env`.

## Where things live

```text
src/app          pages (home, sign in, rent roll, forms)
src/actions      what the forms save
src/lib          rules for money, dates, and who can see a record
src/components   shared pieces of the pages
prisma           the database shape, migrations, and sample data
tests            automated checks
```

The database also has tables for later work that is not on screen yet:

- rent payments (a ledger of what was paid)
- expenses, using the categories on CRA form T776
- documents such as leases and receipts
- N4 notices for unpaid rent

Those screens are not part of this version.
