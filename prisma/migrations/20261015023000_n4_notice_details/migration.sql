-- N4 notice details for SmartRentBoss.
-- Hand-runnable against PostgreSQL if production migrations are applied
-- outside Prisma:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261015023000_n4_notice_details/migration.sql

CREATE TYPE "RentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TYPE "N4ServiceMethod" AS ENUM ('IN_PERSON', 'MAILBOX', 'UNDER_DOOR', 'FAX', 'COURIER', 'MAIL', 'XPRESSPOST');

ALTER TABLE "Notice" ADD COLUMN "givenOn" DATE;
ALTER TABLE "Notice" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Notice" ADD COLUMN "rentFrequency" "RentFrequency";
ALTER TABLE "Notice" ADD COLUMN "n4ServiceMethod" "N4ServiceMethod";
ALTER TABLE "Notice" ADD COLUMN "landlordName" TEXT;
ALTER TABLE "Notice" ADD COLUMN "landlordContact" TEXT;
ALTER TABLE "Notice" ADD COLUMN "tenantNames" TEXT;
ALTER TABLE "Notice" ADD COLUMN "unitAddress" TEXT;
ALTER TABLE "Notice" ADD COLUMN "arrearsRows" JSONB;
