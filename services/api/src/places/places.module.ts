import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { SavedPlacesService } from './saved-places.service';

@Module({
  controllers: [PlacesController],
  providers: [PlacesService, SavedPlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
