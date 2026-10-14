# SmartRentBoss

SmartRentBoss is a small web app for landlords in Ontario who look after about 1 to 10 units. You can sign up, add a property, add the units in that property, and record who is renting each unit. Each month the lease opens a rent charge. You record what was paid, see who is late, and print a receipt.

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

You will see a duplex in Hamilton.

- **Upper.** Jordan Patel, $1,850 due on the 1st, paid up through this month. January was a cheque. The other months were Interac e-Transfer.
- **Lower.** Sam Okonkwo, $1,450 due on the 1st, behind on rent. Older months are paid, the second-most-recent past-due month is a partial cash payment, and the latest past-due month is unpaid.

That sample is dated from the day you run the seed, so Sam is late whenever today is after at least one due date on the lower lease (the lease starts June 1, 2026). You can also create your own account from the home page. A new account starts with an empty rent roll and cannot see the sample landlord's data.

## What you can do

- Create an account, sign in, and log out.
- Add, edit, and delete a property. The province starts as Ontario.
- Add, edit, and delete units on that property.
- Add, edit, and remove a tenant on a unit, including the lease dates, monthly rent in Canadian dollars, the day rent is due, and optional email and phone.
- Read a rent roll that shows, for each property, how many units are occupied and the monthly rent from leases that are active today (America/Toronto).
- Open a monthly ledger for each tenant. A month is Due, Paid, Partial, or Late. Partial means some of that month has been paid. Late means nothing has been paid and the due date has passed.
- Record a payment: date, amount, method, reference number, and notes. Interac e-Transfer is the default. Cash, cheque, pre-authorized debit, and other are there too. The money pays the oldest unpaid month first. A payment can be partial. Anything extra sits as credit until a later month opens.
- Paste an Interac e-Transfer notification email. The form fills the amount, date, and reference and suggests the tenant. You confirm before it is saved.
- See, on the rent roll, how much of this month's rent is collected and who is late, with the amount owed and how many days late.
- Set a reminder schedule, such as 3 days before the due date, the due date, and 3 days late. The app lists who matches that schedule and shows an email you can copy. It does not send email.
- Open a receipt for a payment, print it, or download a PDF.
- Record a move-in date and, if the rent has already gone up once, the date and amount of that increase.
- Mark a unit that was first lived in after November 15, 2018. That unit is exempt from the Ontario guideline. You can keep a short note of the evidence.
- See, on the rent roll, which leases can take a rent increase in the next 120 days, and a reminder in the 14 days before the last day to give 90 days' written notice.
- Draft a rent increase notice. A unit covered by the guideline gets N1 data, filled to the verified guideline percent. An exempt unit gets N2 data, and you choose the amount. Print it or download a PDF. The page is marked DRAFT and says it is not legal advice. It is not the official Landlord and Tenant Board form. Use the link on the draft to open the current form.
- The draft warns you if the increase is above the guideline, if the effective date is less than 12 months after move-in or the last increase, or if fewer than 90 days remain before that date. You can still save the draft after you read the warning.
- Keep the yearly Ontario guideline percents under Settings. Each year has a source link and a verified flag. An N1 draft is blocked until that year's guideline is verified. N2 drafts are not blocked by the guideline, because the guideline does not apply.

The sample landlord has Jordan Patel eligible for an increase inside the 120-day window, and the lower unit marked guideline-exempt. Running the seed again refreshes Jordan's last-increase date so that window stays current, and it puts the guideline years back to the checked percents. The guideline years 2018 through 2027 are copied from [Ontario's rent increase guideline page](https://www.ontario.ca/page/residential-rent-increases) and stored as verified. That page, updated June 23, 2026, lists 2026 as 2.1% and 2027 as 1.9%.
- Create a personal token under **Settings** so an assistant can use the same records. You can revoke the token on that page. What the assistant did is listed in the audit log, tagged **via agent**.

Passwords are stored as a hash. The app never keeps the original password. Agent tokens are stored as a hash too. The secret is shown once, when you create it.

## Connect an assistant (MCP)

An assistant such as Grok Bot can work on this account through the MCP endpoint at `/api/mcp`. The app speaks [streamable HTTP](https://modelcontextprotocol.io): one POST per call, with a bearer token.

1. Sign in and open **Settings**.
2. Name the token and choose **Read**, or **Read and write**.
3. Copy the token. It starts with `srb_`. You will not see it again.
4. Point the MCP client at `http://localhost:3000/api/mcp` and send the token as `Authorization: Bearer srb_...`.

A read token can list properties, tenants, rent status, late tenants, reminders, and receipts. It can also parse an e-Transfer email. A write token can record a payment, ingest an e-Transfer, and save an N4 draft.

Writes that move money, and the N4 draft, do not save on the first call. The tool returns `confirmationToken`. Call the same tool again with that token and the same arguments. The token lasts 15 minutes and works once. `ingest_etransfer_email` is the exception: when the sender, amount, date, and reference match one tenant, it records immediately. A weaker match returns `pending_confirmation` and waits for the token. The same e-Transfer reference is never posted twice.

`prepare_n4_draft` returns the amounts and dates for an N4. It does not create a PDF and it does not serve a notice.

Each call is limited (60 per minute by default) and can see only the landlord who created the token.

Example. List who is late:

```bash
curl -s http://localhost:3000/api/mcp \
  -H "Authorization: Bearer srb_your_token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_late_tenants","arguments":{}}}'
```

Example. Preview a payment, then confirm it:

```bash
curl -s http://localhost:3000/api/mcp \
  -H "Authorization: Bearer srb_your_token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"record_payment","arguments":{"tenancyId":"LEASE_ID","paidOn":"2026-10-14","amount":"25.00","method":"E_TRANSFER","referenceNumber":"CA123"}}}'
```

The response includes `confirmationToken`. Send the same arguments again with that token added. To exercise every tool against the sample landlord, with the database running and the seed loaded:

```bash
npm run mcp:check
```

That check signs in as the sample landlord through the MCP endpoint. It replaces tokens named Grok Bot and Old laptop, and it clears that account's agent audit log, then runs the tools again.

## Checks

From the project folder:

```bash
npm test
npm run lint
```

`npm test` runs the automated checks for rent totals, the ledger, the Interac paste, reminders, receipts, dates, postal codes, form rules, and agent access (a token stays inside its own landlord, a payment waits for confirmation, and an e-Transfer reference cannot be posted twice). The database from `docker compose up -d` has to be running, because those agent checks use it. `npm run lint` looks for common coding mistakes.

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
src/app          pages (home, sign in, rent roll, ledger, receipts, agent access)
src/app/api/mcp  the assistant endpoint
src/actions      what the forms save
src/lib          rules for money, dates, rent, and who can see a record
src/lib/services the same rent and portfolio actions the pages and the assistant use
src/components   shared pieces of the pages
prisma           the database shape, migrations, and sample data
tests            automated checks
scripts          the MCP client check
```

The ledger keeps one charge per lease month. Payments are split across those months. Past-due unpaid amounts are shaped for a future N4 notice (`src/lib/arrears.ts`): the total owing and each month still unpaid. Reminder email goes through `src/lib/email.ts`, which does not send anything until a provider is plugged in.

The database also has tables for later work that is not on screen yet:

- expenses, using the categories on CRA form T776
- documents such as leases and stored files
- N4 notices for unpaid rent
