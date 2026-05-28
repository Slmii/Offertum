import z from 'zod';

// MembershipRole's OWNER value is omitted on purpose — invitations create MEMBER or
// EXTERNAL only (ownership transfer is a separate flow, not an invite).
const TEAM_INVITE_ROLES = ['MEMBER', 'EXTERNAL'] as const;
export type TeamInviteRole = (typeof TEAM_INVITE_ROLES)[number];

export const TeamInviteSchema = z.object({
	email: z.string().trim().email('Please enter a valid email address'),
	role: z.enum(TEAM_INVITE_ROLES)
});

export type TeamInviteForm = z.infer<typeof TeamInviteSchema>;
