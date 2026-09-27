import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayments1790532744639 implements MigrationInterface {
    name = 'CreatePayments1790532744639'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" uuid NOT NULL, "amount" numeric(10,2) NOT NULL, "status" "public"."payment_status" NOT NULL DEFAULT 'PENDING', "transaction_id" character varying(64) NOT NULL, "failure_reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e86edf76dc2424f123b9023a2b2" UNIQUE ("booking_id"), CONSTRAINT "UQ_3c324ca49dabde7ffc0ef64675d" UNIQUE ("transaction_id"), CONSTRAINT "REL_e86edf76dc2424f123b9023a2b" UNIQUE ("booking_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."webhook_event_outcome" AS ENUM('APPLIED', 'IGNORED')`);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_id" character varying(100) NOT NULL, "event_type" character varying(50) NOT NULL, "payment_id" uuid, "payload" jsonb NOT NULL, "outcome" "public"."webhook_event_outcome", "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_eca7d9af1d5bb2184a201ed250d" UNIQUE ("event_id"), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d5ac3a72f24ba2f29622d06577" ON "webhook_events" ("payment_id") `);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "webhook_events" ADD CONSTRAINT "FK_d5ac3a72f24ba2f29622d065776" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "webhook_events" DROP CONSTRAINT "FK_d5ac3a72f24ba2f29622d065776"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d5ac3a72f24ba2f29622d06577"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP TYPE "public"."webhook_event_outcome"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payment_status"`);
    }

}
