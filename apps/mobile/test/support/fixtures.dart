/// Response bodies shaped exactly as the backend returns them.
library;

Map<String, dynamic> meJson({bool driver = false}) => {
      'id': 'user-1',
      'phone': '+94771234567',
      'email': 'rider@test.lk',
      'firstName': 'Nimal',
      'lastName': 'Perera',
      'gender': 'MALE',
      'avatarUrl': null,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'roles': driver ? ['USER', 'DRIVER'] : ['USER'],
      'driverId': driver ? 'driver-1' : null,
      'sharedRidePrefs': {
        'allowSharedRides': true,
        'genderPreference': 'ANY',
        'maxCoPassengers': 2,
        'maxDetourMinutes': 10,
        'allowFrontSeat': true,
        'shareContactWithCoPax': false,
      },
      'wallet': {'balance': '1500.00', 'currency': 'LKR'},
    };

const tokensJson = {
  'accessToken': 'access-1',
  'refreshToken': 'refresh-1',
  'expiresIn': 900,
};

List<Map<String, dynamic>> estimatesJson() => [
      {
        'vehicleTypeId': 'vt-car',
        'code': 'CAR',
        'name': 'Car',
        'seatCapacity': 4,
        'maxPassengers': 4,
        'sharedRideEligible': true,
        'distanceM': 12400,
        'durationS': 1500,
        'etaMinutes': 6,
        'currency': 'LKR',
        'soloFare': '1240.00',
        'sharedFareFrom': '868.00',
        'sharedSaving': '372.00',
      },
      {
        'vehicleTypeId': 'vt-tuk',
        'code': 'TUKTUK',
        'name': 'Tuk-tuk',
        'seatCapacity': 3,
        'maxPassengers': 3,
        'sharedRideEligible': false,
        'distanceM': 12400,
        'durationS': 1680,
        'etaMinutes': 4,
        'currency': 'LKR',
        'soloFare': '860.00',
        'sharedFareFrom': null,
        'sharedSaving': null,
      },
    ];

Map<String, dynamic> sharedSearchJson({int offers = 1, String? noMatchReason}) => {
      'requestId': 'req-1',
      'expiresAt': '2030-01-01T00:00:00.000Z',
      'noMatchReason': noMatchReason,
      'offers': [
        for (var i = 0; i < offers; i++)
          {
            'rideId': 'ride-$i',
            'reference': 'RF-100$i',
            'vehicleType': {'code': 'CAR', 'name': 'Car'},
            'vehicle': {'make': 'Toyota', 'model': 'Axio', 'colour': 'Silver'},
            'driver': {'firstName': 'Kamal', 'rating': '4.85', 'trips': 412},
            'pickupWalkMeters': 120,
            'dropoffWalkMeters': 80,
            'estimatedPickupAt': '2026-09-10T09:15:00.000Z',
            'estimatedDropoffAt': '2026-09-10T09:45:00.000Z',
            'seatsAvailable': 2,
            'coPassengerCount': 1,
            'saving': '372.00',
            'matchQuality': 87,
            'fare': {
              'currency': 'LKR',
              'subtotal': '868.00',
              'discount': '0.00',
              'serviceFee': '0.00',
              'tax': '0.00',
              'total': '868.00',
              'breakdown': [
                {'code': 'BASE', 'label': 'Base fare', 'amount': '868.00'},
              ],
            },
          },
      ],
    };

Map<String, dynamic> createdRideJson() => {
      'rideId': 'ride-new',
      'reference': 'RF-2001',
      'passengerId': 'pax-1',
      'fareQuoteId': 'fq-1',
      'status': 'SEARCHING',
      'fare': {
        'currency': 'LKR',
        'subtotal': '1240.00',
        'discount': '0.00',
        'serviceFee': '0.00',
        'tax': '0.00',
        'total': '1240.00',
        'breakdown': const [],
      },
      'route': {'distanceM': 12400, 'durationS': 1500, 'polyline': '_p~iF~ps|U'},
    };

Map<String, dynamic> cartJson({
  int quantity = 2,
  bool meetsMinimum = true,
  bool unavailable = false,
}) =>
    {
      'cartId': 'cart-1',
      'reference': 'C-1',
      'currency': 'LKR',
      'restaurant': {
        'id': 'rest-1',
        'name': 'Green Cabin',
        'slug': 'green-cabin',
        'logoUrl': null,
        'isAcceptingOrders': true,
        'prepMinutes': 20,
      },
      'items': [
        {
          'id': 'line-1',
          'menuItemId': 'item-1',
          'name': 'Kottu',
          'imageUrl': null,
          'unitPrice': '750.00',
          'quantity': quantity,
          'lineTotal': '${750 * quantity}.00',
          'notes': null,
          'available': !unavailable,
          'priceChanged': false,
          'currentPrice': '750.00',
        },
      ],
      'itemsSubtotal': '${750 * quantity}.00',
      'minimumOrderAmount': '500.00',
      'meetsMinimum': meetsMinimum,
      'hasUnavailableItems': unavailable,
      'hasPriceChanges': false,
      'updatedAt': '2026-09-10T08:00:00.000Z',
    };

Map<String, dynamic> driverProfileJson({
  String presence = 'OFFLINE',
  String approval = 'APPROVED',
  String? activeVehicleId,
  bool acceptsShared = false,
}) =>
    {
      'driverId': 'driver-1',
      'approvalStatus': approval,
      'sharedRideOptIn': true,
      'rating': {'average': '4.90', 'count': 220},
      'completedTrips': 220,
      'availability': {
        'presence': presence,
        'activeVehicleId': activeVehicleId,
        'acceptsShared': acceptsShared,
        'acceptsFood': false,
        'acceptsParcel': false,
      },
      'vehicles': [
        {
          'id': 'veh-1',
          'plateNumber': 'WP CAB-1234',
          'make': 'Toyota',
          'model': 'Axio',
          'colour': 'Silver',
          'year': 2018,
          'seatCapacity': 4,
          'status': 'ACTIVE',
          'isPrimary': true,
          'vehicleType': {'id': 'vt-car', 'code': 'CAR', 'name': 'Car'},
        },
      ],
      'documents': [
        {
          'type': 'DRIVING_LICENCE',
          'status': 'APPROVED',
          'expiresAt': '2030-01-01',
          'reviewNotes': null,
        },
      ],
    };

List<Map<String, dynamic>> rideRequestsJson() => [
      {
        'rideId': 'ride-req-1',
        'reference': 'RF-3001',
        'rideType': 'SHARED',
        'requestedAt': '2026-09-10T08:00:00.000Z',
        'scheduledPickupAt': null,
        'seats': {'total': 4, 'occupied': 1},
        'vehicleType': {'id': 'vt-car', 'code': 'CAR', 'name': 'Car'},
        'distanceM': 8400,
        'durationS': 1080,
        'currency': 'LKR',
        'pickup': {'address': 'Jaffna Bus Stand', 'lat': 9.6615, 'lng': 80.0255},
        'dropoff': {'address': 'Point Pedro', 'lat': 9.8167, 'lng': 80.2333},
        'passengerCount': 1,
        'driverNet': '742.00',
      },
    ];

Map<String, dynamic> driverRideDetailJson({String status = 'ACCEPTED', int passengers = 2}) => {
      'id': 'ride-1',
      'reference': 'RF-3001',
      'rideType': 'SHARED',
      'status': status,
      'scheduledPickupAt': null,
      'startedAt': null,
      'completedAt': null,
      'currency': 'LKR',
      'vehicleType': {'code': 'CAR', 'name': 'Car', 'seatCapacity': 4},
      'route': {'encodedPolyline': '_p~iF~ps|U', 'distanceM': 8400, 'durationS': 1080},
      'seats': {'total': 4, 'occupied': passengers},
      'vehicle': {'make': 'Toyota', 'model': 'Axio', 'colour': 'Silver', 'plateNumber': 'CAB-1234'},
      'passengers': [
        for (var i = 0; i < passengers; i++)
          {
            'id': 'pax-$i',
            'status': 'CONFIRMED',
            'seats': 1,
            'isSharedJoin': i > 0,
            'firstName': i == 0 ? 'Nimal' : 'Sunil',
            'phone': '+9477000000$i',
            'pickup': {'address': 'Stop $i pickup', 'lat': 9.66, 'lng': 80.02},
            'dropoff': {'address': 'Stop $i dropoff', 'lat': 9.81, 'lng': 80.23},
            'note': null,
            'paymentMethod': 'CASH',
          },
      ],
      'stops': [
        for (var i = 0; i < passengers * 2; i++)
          {
            'id': 'stop-$i',
            'sequence': i,
            'type': i.isEven ? 'PICKUP' : 'DROPOFF',
            'status': 'PENDING',
            'address': 'Stop $i',
            'latitude': '9.7',
            'longitude': '80.1',
            'estimatedArrivalAt': null,
            'ridePassengerId': 'pax-${i ~/ 2}',
          },
      ],
    };
