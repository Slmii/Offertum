import { OwnerWrite } from '@/common/decorators/owner-write.decorator';
import { OwnerGuard } from '@/common/guards/owner.guard';
import { CatalogItemsService } from '@/modules/catalog-items/catalog-items.service';
import {
	CatalogItemListResponseDto,
	CatalogItemResponseDto
} from '@/modules/catalog-items/dto/catalog-item.response.dto';
import { CreateCatalogItemDto } from '@/modules/catalog-items/dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '@/modules/catalog-items/dto/update-catalog-item.dto';
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Req,
	UseGuards
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Owner-only — pricing-impacting org data, same gating rationale as
 * `/pricing-playbook`. Members can read the catalog at quote-composition time via
 * a separate read-only endpoint (deferred); the management surface is owner-locked.
 */
@ApiTags('catalog-items')
@Controller('catalog-items')
export class CatalogItemsController {
	constructor(private readonly catalogItems: CatalogItemsService) {}

	@ApiOperation({ summary: 'List catalog items for the active organization' })
	@ApiOkResponse({ type: CatalogItemListResponseDto })
	@UseGuards(OwnerGuard)
	@Get()
	list(@Req() request: Request): Promise<CatalogItemListResponseDto> {
		return this.catalogItems.list(request.organizationId!);
	}

	@ApiOperation({ summary: 'Create a catalog item' })
	@ApiOkResponse({ type: CatalogItemResponseDto })
	@OwnerWrite()
	@Post()
	create(@Req() request: Request, @Body() body: CreateCatalogItemDto): Promise<CatalogItemResponseDto> {
		return this.catalogItems.create(request.organizationId!, body);
	}

	@ApiOperation({ summary: 'Patch a catalog item' })
	@ApiOkResponse({ type: CatalogItemResponseDto })
	@OwnerWrite()
	@Patch(':id')
	update(
		@Req() request: Request,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: UpdateCatalogItemDto
	): Promise<CatalogItemResponseDto> {
		return this.catalogItems.update(request.organizationId!, id, body);
	}

	@ApiOperation({ summary: 'Delete a catalog item' })
	@OwnerWrite()
	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	async delete(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
		await this.catalogItems.delete(request.organizationId!, id);
	}
}
