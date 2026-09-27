import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreatePaymentDto, PaymentWebhookDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from './webhook-signature';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksService } from './webhooks.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
  ) {}

  @ApiBearerAuth()
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { payment, created } = await this.payments.create(user.id, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return payment;
  }

  @Public()
  @SkipThrottle()
  @ApiHeader({ name: TIMESTAMP_HEADER, description: 'Unix time in seconds when the event was signed' })
  @ApiHeader({ name: SIGNATURE_HEADER, description: 'sha256=HMAC_SHA256(secret, "<timestamp>.<raw body>") in hex' })
  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Body() dto: PaymentWebhookDto) {
    return this.webhooks.handle(dto);
  }

  @ApiBearerAuth()
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.get(user.id, id);
  }
}
