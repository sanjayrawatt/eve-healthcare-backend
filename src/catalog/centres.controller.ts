import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CatalogService } from './catalog.service';
import { AddCentreTestDto, CreateCentreDto, ListCentresQueryDto } from './dto/catalog.dto';

@ApiTags('Centres')
@Controller('centres')
export class CentresController {
  constructor(private readonly catalog: CatalogService) {}

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateCentreDto) {
    return this.catalog.createCentre(dto);
  }

  @Public()
  @Get()
  list(@Query() query: ListCentresQueryDto) {
    return this.catalog.listCentres(query);
  }

  @Public()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getCentre(id);
  }

  @Public()
  @Get(':id/tests')
  listTests(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.listCentreTests(id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post(':id/tests')
  addTest(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCentreTestDto) {
    return this.catalog.addTestToCentre(id, dto);
  }
}
