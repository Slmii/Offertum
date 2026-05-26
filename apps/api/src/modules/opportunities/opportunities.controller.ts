import { OrganizationGuard } from '@/common/guards/organization.guard';
import { TenantWrite } from '@/common/decorators/tenant-write.decorator';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { ATTACHMENT_MAX_FILE_BYTES } from '@/lib/storage/attachment-constraints';
import { AssignOpportunityDto } from '@/modules/opportunities/dto/assign-opportunity.dto';
import { DismissOpportunityDto } from '@/modules/opportunities/dto/dismiss-opportunity.dto';
import { ListOpportunitiesQueryDto } from '@/modules/opportunities/dto/list-opportunities-query.dto';
import {
	OpportunityDetailResponseDto,
	ReplyDraftResponseDto
} from '@/modules/opportunities/dto/opportunity-detail.response.dto';
import { OpportunityListResponseDto } from '@/modules/opportunities/dto/opportunity-list.response.dto';
import { OpportunityResponseDto } from '@/modules/opportunities/dto/opportunity.response.dto';
import { UpdateOpportunityFieldsDto } from '@/modules/opportunities/dto/update-opportunity-fields.dto';
import { UpdateOpportunityStatusDto } from '@/modules/opportunities/dto/update-opportunity-status.dto';
import { UpdateReplyDraftDto } from '@/modules/opportunities/dto/update-reply-draft.dto';
import { OpportunitiesService } from '@/modules/opportunities/opportunities.service';
import { ReplyDraftAttachmentResponseDto } from '@/modules/reply-draft-attachments/dto/reply-draft-attachment.response.dto';
import {
	ReplyDraftAttachmentsService,
	type UploadedFileLike
} from '@/modules/reply-draft-attachments/reply-draft-attachments.service';
import {
	Body,
	Controller,
	Delete,
	Get,
	Header,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
	Res,
	UnauthorizedException,
	UploadedFile,
	UseGuards,
	UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
	constructor(
		private readonly opportunities: OpportunitiesService,
		private readonly attachments: ReplyDraftAttachmentsService
	) {}

	@ApiOperation({ summary: 'List opportunities for the active organization' })
	@ApiOkResponse({ type: OpportunityListResponseDto })
	@UseGuards(OrganizationGuard)
	@Get()
	list(@Req() request: Request, @Query() query: ListOpportunitiesQueryDto): Promise<OpportunityListResponseDto> {
		return this.opportunities.list(request.organizationId!, {
			cursor: query.cursor ?? null,
			limit: query.limit ?? null,
			status: query.status ?? null,
			search: query.search ?? null,
			dismissed: query.dismissed ?? null,
			owner: query.owner ?? null,
			assignee: query.assignee ?? null,
			requestingUserId: request.authSession?.user?.id ?? null
		});
	}

	@ApiOperation({ summary: 'Detail view: opportunity + original email body + AI reply draft' })
	@ApiOkResponse({ type: OpportunityDetailResponseDto })
	@UseGuards(OrganizationGuard)
	@Get(':id')
	getDetail(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string
	): Promise<OpportunityDetailResponseDto> {
		return this.opportunities.getDetail(request.organizationId!, id);
	}

	@ApiOperation({ summary: 'Update the AI reply-draft body — autosave from the editor' })
	@ApiOkResponse({ type: ReplyDraftResponseDto })
	@TenantWrite()
	@Patch(':id/reply-draft')
	updateReplyDraft(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdateReplyDraftDto
	): Promise<ReplyDraftResponseDto> {
		return this.opportunities.updateReplyDraft(request.organizationId!, id, body.body);
	}

	@ApiOperation({ summary: 'Regenerate the reply draft using the requesting user’s writing style' })
	@ApiOkResponse({ type: ReplyDraftResponseDto })
	@TenantWrite()
	@Post(':id/reply-draft/regenerate')
	regenerateReplyDraft(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string
	): Promise<ReplyDraftResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.regenerateReplyDraft(request.organizationId!, id, actorUserId);
	}

	@ApiOperation({ summary: 'Send the reply draft as a threaded email' })
	@ApiOkResponse({ type: ReplyDraftResponseDto })
	@TenantWrite()
	@Post(':id/reply-draft/send')
	sendReplyDraft(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string
	): Promise<ReplyDraftResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.sendReplyDraft(request.organizationId!, id, actorUserId);
	}

	@ApiOperation({ summary: 'Compose a follow-up reply draft on a SENT opportunity' })
	@ApiOkResponse({ type: ReplyDraftResponseDto })
	@TenantWrite()
	@Post(':id/reply-draft/followup')
	composeFollowupReplyDraft(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string
	): Promise<ReplyDraftResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.composeFollowupReplyDraft(request.organizationId!, id, actorUserId);
	}

	@ApiOperation({ summary: 'List staged attachments on the reply draft' })
	@ApiOkResponse({ type: [ReplyDraftAttachmentResponseDto] })
	@UseGuards(OrganizationGuard)
	@Get(':id/reply-draft/attachments')
	async listReplyDraftAttachments(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string
	): Promise<ReplyDraftAttachmentResponseDto[]> {
		const rows = await this.attachments.list(request.organizationId!, id);
		return rows.map(toAttachmentResponseDto);
	}

	@ApiOperation({ summary: 'Upload an attachment for the reply draft' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: { file: { type: 'string', format: 'binary' } },
			required: ['file']
		}
	})
	@ApiOkResponse({ type: ReplyDraftAttachmentResponseDto })
	@TenantWrite()
	@UseInterceptors(
		// Multer caps per-file size at the wire boundary so a runaway upload never
		// fills RAM. The service layer enforces the same limit (defense in depth) AND
		// the per-draft total cap, which Multer doesn't know about.
		FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_FILE_BYTES } })
	)
	@Post(':id/reply-draft/attachments')
	async uploadReplyDraftAttachment(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@UploadedFile() file: UploadedFileLike | undefined
	): Promise<ReplyDraftAttachmentResponseDto> {
		const result = await this.attachments.upload(request.organizationId!, id, file);
		return toAttachmentResponseDto(result.attachment);
	}

	@ApiOperation({ summary: 'Download a staged attachment' })
	@UseGuards(OrganizationGuard)
	@Get(':id/reply-draft/attachments/:attachmentId/download')
	async downloadReplyDraftAttachment(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
		@Res() response: Response
	): Promise<void> {
		const result = await this.attachments.download(request.organizationId!, id, attachmentId);
		// `attachment` (vs `inline`) so the browser triggers a save dialog instead of
		// trying to render PDFs/images in-tab — matches the "stage these to send"
		// mental model. The filename is wrapped in quotes per RFC 6266 and we use the
		// `filename*` UTF-8 form so accented filenames survive.
		const encodedName = encodeURIComponent(result.filename);
		response.setHeader('Content-Type', result.contentType);
		response.setHeader(
			'Content-Disposition',
			`attachment; filename="${result.filename.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`
		);
		response.setHeader('Content-Length', String(result.data.byteLength));
		response.end(result.data);
	}

	@ApiOperation({ summary: 'Remove a staged attachment' })
	@TenantWrite()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Header('Cache-Control', 'no-store')
	@Delete(':id/reply-draft/attachments/:attachmentId')
	async deleteReplyDraftAttachment(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Param('attachmentId', new ParseUUIDPipe()) attachmentId: string
	): Promise<void> {
		await this.attachments.delete(request.organizationId!, id, attachmentId);
	}

	@ApiOperation({ summary: 'Update an opportunity status' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Patch(':id/status')
	updateStatus(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdateOpportunityStatusDto
	): Promise<OpportunityResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.updateStatus(request.organizationId!, id, body.status, actorUserId);
	}

	@ApiOperation({ summary: 'Patch owner-editable extracted fields (urgency / address / dates)' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Patch(':id')
	updateFields(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdateOpportunityFieldsDto
	): Promise<OpportunityResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.updateFields(request.organizationId!, id, body, actorUserId);
	}

	@ApiOperation({ summary: 'Dismiss an opportunity (classifier feedback)' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Patch(':id/dismiss')
	dismiss(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: DismissOpportunityDto
	): Promise<OpportunityResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.dismiss(request.organizationId!, id, body.reason, actorUserId, body.notes ?? null);
	}

	@ApiOperation({ summary: 'Assign or unassign the opportunity owner' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Patch(':id/assignee')
	assign(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: AssignOpportunityDto
	): Promise<OpportunityResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.assignOpportunity(request.organizationId!, id, body.userId ?? null, actorUserId);
	}

	@ApiOperation({ summary: 'Un-dismiss an opportunity' })
	@ApiOkResponse({ type: OpportunityResponseDto })
	@TenantWrite()
	@Delete(':id/dismiss')
	undismiss(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string): Promise<OpportunityResponseDto> {
		const actorUserId = requireUserId(request);
		return this.opportunities.undismiss(request.organizationId!, id, actorUserId);
	}
}

/**
 * Pulls the authenticated user's id off the Auth.js session attached by `AuthGuard`.
 * `AuthGuard` is composed into `@TenantWrite`, so by the time a controller method
 * runs this is guaranteed to be set — the throw branch is defensive belt-and-braces.
 */
function requireUserId(request: Request): string {
	const userId = request.authSession?.user?.id;
	if (!userId) {
		throw new UnauthorizedException(NOT_AUTHENTICATED);
	}
	return userId;
}

/**
 * Project the repository row to the wire DTO. Local helper (vs a method on the
 * service) because the controller owns the wire-format conversion for attachments
 * the service layer deals in `Date`s + raw rows.
 */
function toAttachmentResponseDto(row: {
	id: string;
	replyDraftId: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	createdAt: Date;
}): ReplyDraftAttachmentResponseDto {
	return {
		id: row.id,
		replyDraftId: row.replyDraftId,
		filename: row.filename,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		createdAt: row.createdAt.toISOString()
	};
}
