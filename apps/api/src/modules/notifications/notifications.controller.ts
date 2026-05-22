import { OrganizationGuard } from '@/common/guards/organization.guard';
import { NOT_AUTHENTICATED } from '@/lib/errors';
import { NotificationPreferencesResponseDto } from '@/modules/notifications/dto/notification-preferences.response.dto';
import {
	MarkAllReadResponseDto,
	NotificationListResponseDto,
	NotificationResponseDto
} from '@/modules/notifications/dto/notification.response.dto';
import { UpdateNotificationPreferencesDto } from '@/modules/notifications/dto/update-notification-preferences.dto';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Put,
	Req,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('notifications')
@Controller('me/notifications')
@UseGuards(OrganizationGuard)
export class NotificationsController {
	constructor(private readonly notifications: NotificationsService) {}

	@ApiOperation({ summary: 'List in-app notifications for the current user' })
	@ApiOkResponse({ type: NotificationListResponseDto })
	@Get()
	async list(@Req() request: Request): Promise<NotificationListResponseDto> {
		const response = await this.notifications.listForUser(this.userId(request), request.organizationId!);
		return response as NotificationListResponseDto;
	}

	@ApiOperation({ summary: 'Mark a single notification as read' })
	@ApiOkResponse({ type: NotificationResponseDto })
	@HttpCode(HttpStatus.NO_CONTENT)
	@Patch(':id/read')
	async markRead(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
		await this.notifications.markRead(this.userId(request), request.organizationId!, id);
	}

	@ApiOperation({ summary: 'Mark every notification as read for the current user' })
	@ApiOkResponse({ type: MarkAllReadResponseDto })
	@Post('mark-all-read')
	async markAllRead(@Req() request: Request): Promise<MarkAllReadResponseDto> {
		const markedCount = await this.notifications.markAllRead(this.userId(request), request.organizationId!);
		return { markedCount };
	}

	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}

@ApiTags('notifications')
@Controller('me/notification-preferences')
@UseGuards(OrganizationGuard)
export class NotificationPreferencesController {
	constructor(private readonly notifications: NotificationsService) {}

	@ApiOperation({ summary: 'Read notification preferences (event × channel matrix) for the current user' })
	@ApiOkResponse({ type: NotificationPreferencesResponseDto })
	@Get()
	async read(@Req() request: Request): Promise<NotificationPreferencesResponseDto> {
		const preferences = await this.notifications.getPreferences(this.userId(request), request.organizationId!);
		return { preferences };
	}

	@ApiOperation({ summary: 'Update one or more notification preferences' })
	@ApiNoContentResponse()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Put()
	async update(@Req() request: Request, @Body() body: UpdateNotificationPreferencesDto): Promise<void> {
		await this.notifications.updatePreferences(this.userId(request), request.organizationId!, body);
	}

	private userId(request: Request): string {
		const id = request.authSession?.user?.id;
		if (!id) {
			throw new UnauthorizedException(NOT_AUTHENTICATED);
		}
		return id;
	}
}
