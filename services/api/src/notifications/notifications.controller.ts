import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { RegisterDeviceDto } from './dto/notifications.dto';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your notifications' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationDto,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.list(user.id, pagination, unread === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many notifications you have not read' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { updated: await this.notifications.markRead(user.id, id) };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Post('devices')
  @ApiOperation({
    summary: 'Register this device for push notifications',
    description:
      'The response says whether push is actually configured on the server, so a client can tell the difference between "registered" and "will be delivered".',
  })
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.dispatch.registerDevice(user.id, dto.platform, dto.token);
  }

  @Delete('devices/:token')
  @ApiOperation({ summary: 'Stop this device receiving push notifications' })
  unregisterDevice(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.dispatch.unregisterDevice(user.id, token);
  }
}

