import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Counts and balance for the home screen' })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.account.summary(user.id);
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Your wallet balance and ledger' })
  wallet(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.account.wallet(user.id, pagination);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Your payment history' })
  payments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationDto,
    @Query('serviceType') serviceType?: ServiceType,
  ) {
    return this.account.payments(user.id, pagination, serviceType);
  }

  @Get('promotions')
  @ApiOperation({
    summary: 'Promotions you can still use',
    description: 'Codes you have already exhausted are not listed.',
  })
  promotions(@CurrentUser() user: AuthenticatedUser) {
    return this.account.availablePromotions(user.id);
  }
}
