import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  CancelFoodOrderDto,
  CheckoutFoodOrderDto,
  UpdateCartItemDto,
} from './dto/food.dto';
import { FoodOrdersService } from './food-orders.service';
import { FoodQueryService } from './food-query.service';

@ApiTags('food')
@ApiBearerAuth()
@Controller('food')
export class FoodController {
  constructor(
    private readonly cart: CartService,
    private readonly orders: FoodOrdersService,
    private readonly query: FoodQueryService,
  ) {}

  // ---------------------------------------------------------------------- cart

  @Get('carts')
  @ApiOperation({ summary: 'Your open carts, one per restaurant' })
  carts(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.myCarts(user.id);
  }

  @Get('carts/:restaurantId')
  @ApiOperation({ summary: 'Your cart at one restaurant' })
  getCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.cart.getCart(user.id, restaurantId);
  }

  @Post('carts/items')
  @ApiOperation({
    summary: 'Add an item to your cart',
    description:
      'Prices shown in a cart are advisory. Everything is re-priced from the live menu at checkout.',
  })
  addItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(user.id, dto);
  }

  @Put('carts/items/:cartItemId')
  @ApiOperation({ summary: 'Change a quantity. Zero removes the line.' })
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(user.id, cartItemId, dto);
  }

  @Delete('carts/items/:cartItemId')
  @ApiOperation({ summary: 'Remove a line from your cart' })
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
  ) {
    return this.cart.removeItem(user.id, cartItemId);
  }

  @Delete('carts/:restaurantId')
  @ApiOperation({ summary: 'Empty your cart at one restaurant' })
  clearCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.cart.clearCart(user.id, restaurantId);
  }

  // -------------------------------------------------------------------- orders

  @Post('carts/:restaurantId/checkout')
  @ApiOperation({
    summary: 'Place the order',
    description:
      'The amount charged is calculated server-side from current menu prices and the routed delivery distance. A client cannot propose a total.',
  })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: CheckoutFoodOrderDto,
  ) {
    return this.orders.checkout(user.id, restaurantId, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Your order history' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.query.history(user.id, pagination);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'One order' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.query.findOne(orderId, user);
  }

  @Get('orders/:orderId/tracking')
  @ApiOperation({
    summary: 'Delivery progress',
    description: 'Narrow by design — status and timings only, safe to poll.',
  })
  tracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.query.tracking(orderId, user);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel your order',
    description:
      'Allowed until the kitchen starts cooking. Wallet payments are refunded in the same transaction.',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CancelFoodOrderDto,
  ) {
    return this.orders.cancelByCustomer(user.id, orderId, dto.reason);
  }
}
