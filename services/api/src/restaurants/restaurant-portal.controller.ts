import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { RestaurantOrdersService } from '../food/restaurant-orders.service';
import {
  AcceptOrderDto,
  CreateMenuItemDto,
  RejectOrderDto,
  UpdateMenuItemDto,
  UpdateRestaurantProfileDto,
  UpsertMenuCategoryDto,
} from './dto/restaurants.dto';
import { MenuService } from './menu.service';
import { RestaurantsService } from './restaurants.service';

/**
 * The restaurant portal.
 *
 * The RESTAURANT role gets a caller through the door; membership of the specific
 * restaurant in the path is checked inside every service method. Holding the
 * role is not authority over an arbitrary restaurant.
 */
@ApiTags('restaurant-portal')
@ApiBearerAuth()
@Roles(RoleCode.RESTAURANT, RoleCode.ADMIN)
@Controller('restaurant-portal')
export class RestaurantPortalController {
  constructor(
    private readonly restaurants: RestaurantsService,
    private readonly menu: MenuService,
    private readonly orders: RestaurantOrdersService,
  ) {}

  @Get('mine')
  @ApiOperation({ summary: 'The restaurants you work for' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.restaurants.myRestaurants(user.id);
  }

  // ------------------------------------------------------------------ profile

  @Put(':restaurantId/profile')
  @ApiOperation({
    summary: 'Update the restaurant profile',
    description:
      'Owners only. The platform commission rate is not editable here — a restaurant cannot change what it is charged.',
  })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: UpdateRestaurantProfileDto,
  ) {
    return this.menu.updateProfile(restaurantId, user.id, dto);
  }

  // ----------------------------------------------------------------- catalogue

  @Get(':restaurantId/categories')
  @ApiOperation({ summary: 'Menu categories' })
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.menu.listCategories(restaurantId, user.id);
  }

  @Post(':restaurantId/categories')
  @ApiOperation({ summary: 'Create a menu category' })
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: UpsertMenuCategoryDto,
  ) {
    return this.menu.createCategory(restaurantId, user.id, dto);
  }

  @Put(':restaurantId/categories/:categoryId')
  @ApiOperation({ summary: 'Update a menu category' })
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpsertMenuCategoryDto,
  ) {
    return this.menu.updateCategory(restaurantId, user.id, categoryId, dto);
  }

  @Get(':restaurantId/items')
  @ApiOperation({ summary: 'Menu items' })
  items(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.menu.listItems(restaurantId, user.id, categoryId);
  }

  @Post(':restaurantId/items')
  @ApiOperation({ summary: 'Add a menu item' })
  createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.menu.createItem(restaurantId, user.id, dto);
  }

  @Put(':restaurantId/items/:itemId')
  @ApiOperation({ summary: 'Update a menu item' })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(restaurantId, user.id, itemId, dto);
  }

  @Post(':restaurantId/items/:itemId/availability')
  @ApiOperation({ summary: 'Mark an item available or sold out' })
  setAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { available: boolean },
  ) {
    return this.menu.setAvailability(restaurantId, user.id, itemId, body.available === true);
  }

  @Delete(':restaurantId/items/:itemId')
  @ApiOperation({
    summary: 'Withdraw a menu item',
    description: 'Soft delete. Past orders keep their own name and price snapshots.',
  })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.menu.removeItem(restaurantId, user.id, itemId);
  }

  // -------------------------------------------------------------------- orders

  @Get(':restaurantId/orders/active')
  @ApiOperation({ summary: 'Orders needing attention now' })
  activeOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.orders.activeOrders(restaurantId, user.id);
  }

  @Get(':restaurantId/orders/history')
  @ApiOperation({ summary: 'Completed and cancelled orders' })
  orderHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.orders.history(restaurantId, user.id, pagination);
  }

  @Get(':restaurantId/orders/:orderId')
  @ApiOperation({ summary: 'One order' })
  order(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.findOne(restaurantId, user.id, orderId);
  }

  @Post(':restaurantId/orders/:orderId/accept')
  @ApiOperation({ summary: 'Accept an order and commit to a preparation time' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AcceptOrderDto,
  ) {
    return this.orders.accept(restaurantId, user.id, orderId, dto);
  }

  @Post(':restaurantId/orders/:orderId/reject')
  @ApiOperation({
    summary: 'Decline an order',
    description: 'The customer is refunded in the same transaction.',
  })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.orders.reject(restaurantId, user.id, orderId, dto);
  }

  @Post(':restaurantId/orders/:orderId/preparing')
  @ApiOperation({ summary: 'Report that cooking has started' })
  preparing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.startPreparing(restaurantId, user.id, orderId);
  }

  @Post(':restaurantId/orders/:orderId/ready')
  @ApiOperation({ summary: 'Report that the order is ready for collection' })
  ready(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.orders.markReady(restaurantId, user.id, orderId);
  }

  @Get(':restaurantId/earnings')
  @ApiOperation({ summary: 'Aggregated takings for the period' })
  earnings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.orders.earnings(
      restaurantId,
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}
