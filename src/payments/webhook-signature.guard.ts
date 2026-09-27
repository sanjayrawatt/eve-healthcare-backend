import {
  CanActivate,
  ExecutionContext,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from './webhook-signature';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const result = verifyWebhookSignature({
      secret: this.config.getOrThrow<string>('WEBHOOK_SECRET'),
      toleranceSeconds: this.config.getOrThrow<number>('WEBHOOK_TOLERANCE_SECONDS'),
      rawBody: req.rawBody,
      signature: req.header(SIGNATURE_HEADER),
      timestamp: req.header(TIMESTAMP_HEADER),
    });
    if (!result.valid) {
      throw new UnauthorizedException(result.reason);
    }
    return true;
  }
}
