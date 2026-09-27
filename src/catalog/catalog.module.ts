import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { CentresController } from './centres.controller';
import { CentreTest } from './entities/centre-test.entity';
import { Centre } from './entities/centre.entity';
import { DiagnosticTest } from './entities/diagnostic-test.entity';
import { TestsController } from './tests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Centre, DiagnosticTest, CentreTest])],
  controllers: [CentresController, TestsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
