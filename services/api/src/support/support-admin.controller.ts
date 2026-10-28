import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AdminTicketListDto,
  AdminTicketReplyDto,
  AssignTicketDto,
  UpdateTicketStatusDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

/**
 * The support queue.
 *
 * Gated on ADMIN for the whole controller: the platform has no separate support
 * role, so support staff are administrators and the existing RBAC guard is the
 * one enforcing it.
 */
@ApiTags('admin-support')
@ApiBearerAuth()
@Roles(RoleCode.ADMIN)
@Controller('admin/support/tickets')
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'The ticket queue, oldest unanswered first' })
  list(@Query() query: AdminTicketListDto) {
    return this.support.listTickets(query);
  }

  @Get(':ticketId')
  @ApiOperation({ summary: 'One ticket, including internal notes' })
  get(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.support.getTicket(ticketId);
  }

  @Post(':ticketId/messages')
  @ApiOperation({
    summary: 'Reply to the customer, or leave an internal note',
    description: 'An internal note is never shown to the customer, so it cannot answer them.',
  })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: AdminTicketReplyDto,
  ) {
    return this.support.reply(user.id, ticketId, dto);
  }

  @Put(':ticketId/status')
  @ApiOperation({ summary: 'Move the ticket through its lifecycle' })
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.support.setStatus(user.id, ticketId, dto.status);
  }

  @Put(':ticketId/assignee')
  @ApiOperation({ summary: 'Assign the ticket, or take it yourself' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.support.assign(user.id, ticketId, dto.assignedToUserId);
  }
}
