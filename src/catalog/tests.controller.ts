import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CatalogService } from './catalog.service';
import { CreateTestDto, ListTestsQueryDto } from './dto/catalog.dto';

@ApiTags('Tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly catalog: CatalogService) {}

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateTestDto) {
    return this.catalog.createTest(dto);
  }

  @Public()
  @Get()
  list(@Query() query: ListTestsQueryDto) {
    return this.catalog.listTests(query);
  }
}
