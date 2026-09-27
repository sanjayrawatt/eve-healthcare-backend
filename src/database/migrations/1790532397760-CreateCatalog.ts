import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCatalog1790532397760 implements MigrationInterface {
    name = 'CreateCatalog1790532397760'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "centres" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "address" character varying(255) NOT NULL, "city" character varying(100) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0220a98077fab39bf8142b59b37" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6566a2263883888d71a5c940d2" ON "centres" ("city") `);
        await queryRunner.query(`CREATE TABLE "diagnostic_tests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_6367f0f277a195c0e162281c93f" UNIQUE ("name"), CONSTRAINT "PK_dcf7e761d09a27870664dcc21dd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "centre_tests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "centre_id" uuid NOT NULL, "test_id" uuid NOT NULL, "price" numeric(10,2) NOT NULL, "is_available" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_787e3320f8ac8833fa134c156a" CHECK ("price" > 0), CONSTRAINT "PK_807adf9dbe8eb803881d54031d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_794e2c0856e428bccd803ee3f1" ON "centre_tests" ("test_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4a637cd5428fe026526b6352fa" ON "centre_tests" ("centre_id", "test_id") `);
        await queryRunner.query(`ALTER TABLE "centre_tests" ADD CONSTRAINT "FK_6efecd1b77b5191bd38c3c45584" FOREIGN KEY ("centre_id") REFERENCES "centres"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "centre_tests" ADD CONSTRAINT "FK_794e2c0856e428bccd803ee3f15" FOREIGN KEY ("test_id") REFERENCES "diagnostic_tests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "centre_tests" DROP CONSTRAINT "FK_794e2c0856e428bccd803ee3f15"`);
        await queryRunner.query(`ALTER TABLE "centre_tests" DROP CONSTRAINT "FK_6efecd1b77b5191bd38c3c45584"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4a637cd5428fe026526b6352fa"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_794e2c0856e428bccd803ee3f1"`);
        await queryRunner.query(`DROP TABLE "centre_tests"`);
        await queryRunner.query(`DROP TABLE "diagnostic_tests"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6566a2263883888d71a5c940d2"`);
        await queryRunner.query(`DROP TABLE "centres"`);
    }

}
