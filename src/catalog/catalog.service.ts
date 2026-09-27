import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, Paginated } from '../common/dto/pagination.dto';
import { isUniqueViolation } from '../database/pg-errors';
import { CacheService } from '../redis/cache.service';
import {
  AddCentreTestDto,
  CreateCentreDto,
  CreateTestDto,
  ListCentresQueryDto,
  ListTestsQueryDto,
} from './dto/catalog.dto';
import { CentreTest } from './entities/centre-test.entity';
import { Centre } from './entities/centre.entity';
import { DiagnosticTest } from './entities/diagnostic-test.entity';

export interface CentreTestResponse {
  centreTestId: string;
  testId: string;
  name: string;
  description: string | null;
  price: number;
}

export interface CentreDetailResponse extends Centre {
  tests: CentreTestResponse[];
}

const CACHE_NS = 'catalog';

function toCentreTestResponse(ct: CentreTest): CentreTestResponse {
  return {
    centreTestId: ct.id,
    testId: ct.test.id,
    name: ct.test.name,
    description: ct.test.description,
    price: ct.price,
  };
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Centre) private readonly centres: Repository<Centre>,
    @InjectRepository(DiagnosticTest) private readonly tests: Repository<DiagnosticTest>,
    @InjectRepository(CentreTest) private readonly centreTests: Repository<CentreTest>,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const ttl = this.config.getOrThrow<number>('CATALOG_CACHE_TTL_SECONDS');
    return this.cache.getOrSet(CACHE_NS, key, ttl, load);
  }

  async createCentre(dto: CreateCentreDto): Promise<Centre> {
    const centre = await this.centres.save(this.centres.create(dto));
    await this.cache.invalidate(CACHE_NS);
    return centre;
  }

  listCentres(query: ListCentresQueryDto): Promise<Paginated<Centre>> {
    const key = `centres:${query.page}:${query.limit}:${query.city?.toLowerCase() ?? ''}:${query.testId ?? ''}`;
    return this.cached(key, () => this.queryCentres(query));
  }

  private async queryCentres(query: ListCentresQueryDto): Promise<Paginated<Centre>> {
    const qb = this.centres
      .createQueryBuilder('centre')
      .where('centre.isActive = true')
      .orderBy('centre.name', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    if (query.city) {
      qb.andWhere('LOWER(centre.city) = LOWER(:city)', { city: query.city });
    }
    if (query.testId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM centre_tests ct
                 WHERE ct.centre_id = centre.id AND ct.test_id = :testId AND ct.is_available = true)`,
        { testId: query.testId },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query);
  }

  getCentre(id: string): Promise<CentreDetailResponse> {
    return this.cached(`centre:${id}`, async () => {
      const centre = await this.findActiveCentre(id);
      return { ...centre, tests: await this.loadAvailableTests(id) };
    });
  }

  async listCentreTests(centreId: string): Promise<CentreTestResponse[]> {
    return (await this.getCentre(centreId)).tests;
  }

  private async loadAvailableTests(centreId: string): Promise<CentreTestResponse[]> {
    const rows = await this.centreTests.find({
      where: { centreId, isAvailable: true },
      relations: { test: true },
      order: { test: { name: 'ASC' } },
    });
    return rows.map(toCentreTestResponse);
  }

  async addTestToCentre(centreId: string, dto: AddCentreTestDto): Promise<CentreTestResponse> {
    await this.findActiveCentre(centreId);
    const test = await this.tests.findOneBy({ id: dto.testId });
    if (!test) {
      throw new NotFoundException('Diagnostic test not found');
    }

    try {
      const saved = await this.centreTests.save(
        this.centreTests.create({ centreId, testId: test.id, price: dto.price }),
      );
      await this.cache.invalidate(CACHE_NS);
      return toCentreTestResponse({ ...saved, test });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This test is already offered at this centre');
      }
      throw error;
    }
  }

  async createTest(dto: CreateTestDto): Promise<DiagnosticTest> {
    const existing = await this.tests
      .createQueryBuilder('test')
      .where('LOWER(test.name) = LOWER(:name)', { name: dto.name })
      .getExists();
    if (existing) {
      throw new ConflictException('A test with this name already exists');
    }
    const test = await this.tests.save(this.tests.create(dto));
    await this.cache.invalidate(CACHE_NS);
    return test;
  }

  listTests(query: ListTestsQueryDto): Promise<Paginated<DiagnosticTest>> {
    const key = `tests:${query.page}:${query.limit}:${query.search?.toLowerCase() ?? ''}`;
    return this.cached(key, () => this.queryTests(query));
  }

  private async queryTests(query: ListTestsQueryDto): Promise<Paginated<DiagnosticTest>> {
    const qb = this.tests
      .createQueryBuilder('test')
      .orderBy('test.name', 'ASC')
      .skip(query.skip)
      .take(query.limit);
    if (query.search) {
      qb.where('test.name ILIKE :search', { search: `%${query.search}%` });
    }
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query);
  }

  async findBookableCentreTest(centreId: string, testId: string): Promise<CentreTest> {
    await this.findActiveCentre(centreId);
    const centreTest = await this.centreTests.findOne({
      where: { centreId, testId, isAvailable: true },
      relations: { centre: true, test: true },
    });
    if (!centreTest) {
      throw new NotFoundException('This test is not offered at this centre');
    }
    return centreTest;
  }

  private async findActiveCentre(id: string): Promise<Centre> {
    const centre = await this.centres.findOneBy({ id, isActive: true });
    if (!centre) {
      throw new NotFoundException('Diagnostic centre not found');
    }
    return centre;
  }
}
