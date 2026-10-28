import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { AddTicketMessageDto, CreateTicketDto } from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * A customer's own support tickets.
 *
 * Every route is scoped to the caller. There is no route here that takes a
 * user id, so one customer cannot read another's ticket by changing a
 * parameter.
 */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Raise a support ticket' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Your tickets' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.support.listMyTickets(user.id, pagination);
  }

  @Get(':ticketId')
  @ApiOperation({
    summary: 'One of your tickets, with the conversation',
    description: 'Internal staff notes are excluded by the query itself, not by the projection.',
  })
  get(@CurrentUser() user: AuthenticatedUser, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.support.getMyTicket(user.id, ticketId);
  }

  @Post(':ticketId/messages')
  @ApiOperation({
    summary: 'Reply on your ticket',
    description: 'Replying to a ticket support had parked brings it back into the queue.',
  })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: AddTicketMessageDto,
  ) {
    return this.support.addMyMessage(user.id, ticketId, dto);
  }

  @Post(':ticketId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close your own ticket' })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    return this.support.closeMyTicket(user.id, ticketId);
  }
}
