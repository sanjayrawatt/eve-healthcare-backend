import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBookings1790532517419 implements MigrationInterface {
    name = 'CreateBookings1790532517419'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."booking_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "centre_test_id" uuid NOT NULL, "appointment_at" TIMESTAMP WITH TIME ZONE NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "public"."booking_status" NOT NULL DEFAULT 'PENDING', "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_73ad81777b38d99049238374d8" CHECK ("amount" > 0), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_bookings_active_slot" ON "bookings" ("user_id", "centre_test_id", "appointment_at") WHERE "status" IN ('PENDING', 'CONFIRMED')`);
        await queryRunner.query(`CREATE INDEX "IDX_b1f9562c572891881e98e158b2" ON "bookings" ("user_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_64cd97487c5c42806458ab5520c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_6e7ead46c40ec6a236209232baf" FOREIGN KEY ("centre_test_id") REFERENCES "centre_tests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_6e7ead46c40ec6a236209232baf"`);
        await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_64cd97487c5c42806458ab5520c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b1f9562c572891881e98e158b2"`);
        await queryRunner.query(`DROP INDEX "public"."uq_bookings_active_slot"`);
        await queryRunner.query(`DROP TABLE "bookings"`);
        await queryRunner.query(`DROP TYPE "public"."booking_status"`);
    }

}
