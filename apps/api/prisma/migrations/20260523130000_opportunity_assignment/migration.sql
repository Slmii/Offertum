-- Per-opp assignment: any org member can be set as the workflow owner of a given
-- Opportunity. ON DELETE SET NULL so deleting a user doesn't orphan the opp row.
ALTER TABLE "Opportunity" ADD COLUMN "assignedToUserId" UUID;

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index supporting the "Toegewezen aan mij" list filter. (assignedToUserId,
-- organizationId) is the common lookup shape; making it composite keeps the filter
-- an index-only scan even with tens of thousands of opportunities.
CREATE INDEX "Opportunity_assignedToUserId_organizationId_idx"
  ON "Opportunity" ("assignedToUserId", "organizationId");
