-- Bring `OpportunityStatus` + `Urgency` into line with the rest of the schema:
-- every other Prisma enum (`MembershipRole`, `AICallStatus`, `EmailProvider`,
-- `LogLevel`) stores uppercase in Postgres. The W4.4 `@map("lowercase")` directives
-- were inconsistent — we drop them and rename the existing enum values in place.
--
-- `ALTER TYPE ... RENAME VALUE` only relabels the enum entries; existing rows that
-- reference the values + the column DEFAULT update automatically, so this is a safe
-- in-place rename with no data migration needed.

-- OpportunityStatus
ALTER TYPE "OpportunityStatus" RENAME VALUE 'new' TO 'NEW';
ALTER TYPE "OpportunityStatus" RENAME VALUE 'replied' TO 'REPLIED';
ALTER TYPE "OpportunityStatus" RENAME VALUE 'waiting' TO 'WAITING';
ALTER TYPE "OpportunityStatus" RENAME VALUE 'cold' TO 'COLD';
ALTER TYPE "OpportunityStatus" RENAME VALUE 'won' TO 'WON';
ALTER TYPE "OpportunityStatus" RENAME VALUE 'lost' TO 'LOST';

-- Urgency
ALTER TYPE "Urgency" RENAME VALUE 'emergency' TO 'EMERGENCY';
ALTER TYPE "Urgency" RENAME VALUE 'high' TO 'HIGH';
ALTER TYPE "Urgency" RENAME VALUE 'normal' TO 'NORMAL';
ALTER TYPE "Urgency" RENAME VALUE 'low' TO 'LOW';
