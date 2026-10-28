import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/roles.decorator';
import { PaymentWebhooksService } from './payment-webhooks.service';

/**
 * The provider's callback.
 *
 * Public by necessity — a payment gateway has no bearer token — and therefore
 * authenticated by signature instead. The raw body is needed byte-for-byte
 * because that is what the signature covers; a re-serialised object would not
 * verify.
 */
@ApiTags('payments')
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Payment provider callback' })
  async receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-signature') signature?: string,
  ) {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});

    // The response is deliberately a bare acknowledgement. Telling a caller why
    // their event was rejected would help someone probe the endpoint.
    await this.webhooks.handle(raw, signature);
    return { received: true };
  }
}
