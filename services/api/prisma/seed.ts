/* eslint-disable no-console */
import {
  Gender,
  Prisma,
  PrismaClient,
  RoleCode,
  ServiceType,
  SharedRideGenderPreference,
} from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { SETTING_DEFINITIONS } from '../src/settings/settings.registry';

/**
 * Seeds REFERENCE DATA only — roles, vehicle classes, parcel classes, pricing
 * rules and the admin settings registry. Everything here is idempotent and safe
 * to run against any environment.
 *
 * Demonstration accounts and journeys are written ONLY when SEED_DEMO=true and
 * NODE_ENV is not production (§38). No fake driver, fake payment or fake fare
 * ever forms part of the production data set.
 */
const prisma = new PrismaClient();

const D = (v: number | string) => new Prisma.Decimal(v);

async function seedRoles(): Promise<void> {
  const roles: Array<{ code: RoleCode; name: string; description: string }> = [
    { code: RoleCode.ADMIN, name: 'Administrator', description: 'Full platform administration' },
    { code: RoleCode.DRIVER, name: 'Driver', description: 'Accepts and fulfils rides and deliveries' },
    { code: RoleCode.USER, name: 'Customer', description: 'Books rides, food and parcels' },
    { code: RoleCode.RESTAURANT, name: 'Restaurant', description: 'Manages a restaurant and its orders' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: role,
      update: { name: role.name, description: role.description },
    });
  }

  console.log(`  roles: ${roles.length}`);
}

async function seedVehicleTypes(): Promise<void> {
  const types = [
    {
      code: 'BIKE',
      name: 'Bike',
      description: 'Motorcycle for one passenger',
      seatCapacity: 1,
      maxPassengers: 1,
      sharedRideEligible: false,
      parcelEligible: true,
      foodDeliveryEligible: true,
      maxParcelWeightKg: D(10),
      sortOrder: 1,
    },
    {
      code: 'AUTO',
      name: 'Auto',
      description: 'Three-wheeler',
      seatCapacity: 3,
      maxPassengers: 3,
      sharedRideEligible: true,
      parcelEligible: true,
      foodDeliveryEligible: true,
      maxParcelWeightKg: D(50),
      sortOrder: 2,
    },
    {
      code: 'CAR',
      name: 'Car',
      description: 'Air-conditioned car',
      seatCapacity: 4,
      maxPassengers: 4,
      sharedRideEligible: true,
      parcelEligible: true,
      foodDeliveryEligible: true,
      maxParcelWeightKg: D(80),
      sortOrder: 3,
    },
    {
      code: 'MINI_VAN',
      name: 'Mini Van',
      description: 'Van for larger groups',
      seatCapacity: 7,
      maxPassengers: 6,
      sharedRideEligible: true,
      parcelEligible: true,
      foodDeliveryEligible: false,
      maxParcelWeightKg: D(200),
      sortOrder: 4,
    },
  ];

  for (const type of types) {
    await prisma.vehicleType.upsert({
      where: { code: type.code },
      create: type,
      update: type,
    });
  }

  console.log(`  vehicle types: ${types.length}`);
}

async function seedParcelTypes(): Promise<void> {
  const types = [
    {
      code: 'DOCUMENT',
      name: 'Documents',
      description: 'Papers, envelopes and small documents',
      maxWeightKg: D(2),
      minVehicleTypeCode: 'BIKE',
      sortOrder: 1,
    },
    {
      code: 'SMALL',
      name: 'Small parcel',
      description: 'Fits in a backpack',
      maxWeightKg: D(10),
      minVehicleTypeCode: 'BIKE',
      sortOrder: 2,
    },
    {
      code: 'MEDIUM',
      name: 'Medium parcel',
      description: 'Boxed goods up to 50 kg',
      maxWeightKg: D(50),
      minVehicleTypeCode: 'AUTO',
      sortOrder: 3,
    },
    {
      code: 'LARGE',
      name: 'Large parcel',
      description: 'Bulky goods requiring a van',
      maxWeightKg: D(200),
      minVehicleTypeCode: 'MINI_VAN',
      requiresSignature: true,
      sortOrder: 4,
    },
  ];

  for (const type of types) {
    await prisma.parcelType.upsert({
      where: { code: type.code },
      create: type,
      update: type,
    });
  }

  console.log(`  parcel types: ${types.length}`);
}

/**
 * Baseline LKR pricing. These are STARTING POINTS for an operator to tune from
 * the admin console — they are not a commercial recommendation, and every one
 * of them is editable at runtime.
 */
async function seedPricingRules(): Promise<void> {
  const vehicleTypes = await prisma.vehicleType.findMany();
  const byCode = new Map(vehicleTypes.map((v) => [v.code, v.id]));

  const baseline: Record<
    string,
    { base: number; perKm: number; perMin: number; min: number; commission: number }
  > = {
    BIKE: { base: 60, perKm: 32, perMin: 2, min: 100, commission: 15 },
    AUTO: { base: 90, perKm: 45, perMin: 3, min: 150, commission: 18 },
    CAR: { base: 150, perKm: 68, perMin: 4, min: 280, commission: 20 },
    MINI_VAN: { base: 250, perKm: 95, perMin: 5, min: 450, commission: 22 },
  };

  let created = 0;

  for (const [code, values] of Object.entries(baseline)) {
    const vehicleTypeId = byCode.get(code);
    if (!vehicleTypeId) continue;

    for (const serviceType of [ServiceType.RIDE, ServiceType.SHARED_RIDE]) {
      const existing = await prisma.pricingRule.findFirst({
        where: { serviceType, vehicleTypeId, active: true, effectiveTo: null },
      });
      if (existing) continue;

      const isShared = serviceType === ServiceType.SHARED_RIDE;
      if (isShared && !vehicleTypes.find((v) => v.id === vehicleTypeId)?.sharedRideEligible) {
        continue;
      }

      await prisma.pricingRule.create({
        data: {
          serviceType,
          vehicleTypeId,
          version: 1,
          active: true,
          currency: 'LKR',
          baseFare: D(values.base),
          perKmFare: D(values.perKm),
          perMinuteFare: D(values.perMin),
          minimumFare: D(values.min),
          bookingFee: D(0),
          waitingPerMinuteFee: D(4),
          freeWaitingMinutes: 5,
          // A passenger joining an existing route saves; a solo ride does not.
          sharedDiscountPct: isShared ? D(30) : D(0),
          maxPassengerDiscountPct: D(50),
          serviceFeePct: D(0),
          taxPct: D(0),
          cancellationFee: D(100),
          freeCancellationSeconds: 120,
          platformCommissionPct: D(values.commission),
          // The driver's cut of an additional shared passenger's fare. Set low
          // by default because the driver was making the journey anyway; the
          // operator tunes this to their market.
          sharedPassengerDriverSharePct: isShared ? D(20) : D(0),
          additionalStopFee: isShared ? D(20) : D(0),
          minimumDriverEarning: D(0),
        },
      });
      created += 1;
    }
  }

  // Vehicle-agnostic fallbacks for delivery services.
  for (const serviceType of [ServiceType.FOOD_DELIVERY, ServiceType.PARCEL]) {
    const existing = await prisma.pricingRule.findFirst({
      where: { serviceType, vehicleTypeId: null, active: true, effectiveTo: null },
    });
    if (existing) continue;

    await prisma.pricingRule.create({
      data: {
        serviceType,
        vehicleTypeId: null,
        version: 1,
        active: true,
        currency: 'LKR',
        baseFare: serviceType === ServiceType.FOOD_DELIVERY ? D(120) : D(150),
        perKmFare: D(40),
        perMinuteFare: D(2),
        minimumFare: serviceType === ServiceType.FOOD_DELIVERY ? D(180) : D(220),
        bookingFee: D(0),
        waitingPerMinuteFee: D(3),
        freeWaitingMinutes: 5,
        sharedDiscountPct: D(0),
        maxPassengerDiscountPct: D(50),
        serviceFeePct: D(0),
        taxPct: D(0),
        cancellationFee: D(80),
        freeCancellationSeconds: 120,
        platformCommissionPct: D(18),
        sharedPassengerDriverSharePct: D(0),
        additionalStopFee: D(0),
        minimumDriverEarning: D(0),
      },
    });
    created += 1;
  }

  console.log(`  pricing rules: ${created} created`);
}

async function seedSettings(): Promise<void> {
  const existing = await prisma.adminSetting.findMany({ select: { key: true } });
  const known = new Set(existing.map((r) => r.key));
  const missing = SETTING_DEFINITIONS.filter((d) => !known.has(d.key));

  if (missing.length > 0) {
    await prisma.adminSetting.createMany({
      data: missing.map((d) => ({
        key: d.key,
        value: d.defaultValue as Prisma.InputJsonValue,
        valueType: d.valueType,
        category: d.category,
        label: d.label,
        description: d.description,
        minValue: d.min ?? null,
        maxValue: d.max ?? null,
      })),
      skipDuplicates: true,
    });
  }

  console.log(`  admin settings: ${missing.length} added, ${known.size} already present`);
}

/**
 * Creates the first administrator, from environment variables only.
 *
 * The password is never defaulted or printed. Without ADMIN_PHONE and
 * ADMIN_PASSWORD the step is skipped, so a deployment cannot accidentally ship
 * a well-known administrator credential.
 */
async function seedAdmin(): Promise<void> {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!phone || !password) {
    console.log('  admin: skipped (set ADMIN_PHONE and ADMIN_PASSWORD to create one)');
    return;
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
  if (existing) {
    console.log('  admin: already exists');
    return;
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });

  await prisma.user.create({
    data: {
      phone,
      email: process.env.ADMIN_EMAIL,
      passwordHash: await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      firstName: process.env.ADMIN_FIRST_NAME ?? 'Platform',
      lastName: 'Administrator',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      roles: { create: { roleId: role.id } },
      sharedRidePrefs: { create: {} },
      wallet: { create: {} },
    },
  });

  console.log('  admin: created');
}

/**
 * DEVELOPMENT ONLY. Creates the cast from the specification's worked example so
 * the shared-ride flow can be exercised end to end.
 */
async function seedDemo(): Promise<void> {
  if (process.env.SEED_DEMO !== 'true') {
    console.log('  demo data: skipped (set SEED_DEMO=true in development to create it)');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demonstration data in production');
  }

  const password = await hash('DemoPassword123!', {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const userRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.USER } });
  const driverRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.DRIVER } });
  const car = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });

  const people = [
    { phone: '+94770000001', firstName: 'Ananthi', gender: Gender.FEMALE, pref: SharedRideGenderPreference.WOMEN_ONLY },
    { phone: '+94770000002', firstName: 'Bavan', gender: Gender.MALE, pref: SharedRideGenderPreference.ANY },
    { phone: '+94770000003', firstName: 'Chandran', gender: Gender.MALE, pref: SharedRideGenderPreference.ANY },
    { phone: '+94770000004', firstName: 'Dilani', gender: Gender.FEMALE, pref: SharedRideGenderPreference.ANY },
  ];

  for (const person of people) {
    const existing = await prisma.user.findFirst({ where: { phone: person.phone } });
    if (existing) continue;

    await prisma.user.create({
      data: {
        phone: person.phone,
        passwordHash: password,
        firstName: person.firstName,
        gender: person.gender,
        phoneVerifiedAt: new Date(),
        roles: { create: { roleId: userRole.id } },
        sharedRidePrefs: { create: { genderPreference: person.pref } },
        wallet: { create: { balance: D(5000) } },
      },
    });
  }

  const driverPhone = '+94770000099';
  let driverUser = await prisma.user.findFirst({ where: { phone: driverPhone } });

  if (!driverUser) {
    driverUser = await prisma.user.create({
      data: {
        phone: driverPhone,
        passwordHash: password,
        firstName: 'Kumar',
        lastName: 'Selvarajah',
        gender: Gender.MALE,
        phoneVerifiedAt: new Date(),
        roles: { create: [{ roleId: userRole.id }, { roleId: driverRole.id }] },
        sharedRidePrefs: { create: {} },
        wallet: { create: {} },
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleTypeId: car.id,
        plateNumber: 'NP-DEMO-01',
        make: 'Toyota',
        model: 'Axio',
        year: 2019,
        colour: 'Silver',
        seatCapacity: 4,
        status: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });

    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        licenceNumber: 'DEMO-LIC-0001',
        licenceExpiry: new Date('2030-01-01'),
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        sharedRideOptIn: true,
        vehicles: { create: { vehicleId: vehicle.id, isPrimary: true } },
        availability: {
          create: {
            presence: 'ONLINE',
            activeVehicleId: vehicle.id,
            acceptsShared: true,
            acceptsFood: true,
            acceptsParcel: true,
            wentOnlineAt: new Date(),
          },
        },
      },
    });

    // Live position at Jaffna, so the driver is dispatchable immediately.
    await prisma.$executeRaw`
      INSERT INTO driver_locations_current (driver_id, latitude, longitude, recorded_at, updated_at)
      VALUES (${driver.id}::uuid, 9.6615, 80.0255, now(), now())
      ON CONFLICT (driver_id) DO UPDATE
        SET latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            recorded_at = EXCLUDED.recorded_at
    `;
  }

  await seedDemoRestaurant(password);
  await seedSecondDemoCourier(password);

  console.log('  demo data: 4 passengers, 2 approved drivers, 1 restaurant with a menu');
}

/**
 * DEVELOPMENT ONLY. A restaurant on the Jaffna corridor with a small menu, so
 * the food module can be exercised end to end.
 */
async function seedDemoRestaurant(password: string): Promise<void> {
  const existing = await prisma.restaurant.findUnique({ where: { slug: 'jaffna-kitchen' } });
  if (existing) return;

  const restaurantRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.RESTAURANT },
  });
  const userRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.USER } });

  const owner = await prisma.user.create({
    data: {
      phone: '+94770000200',
      passwordHash: password,
      firstName: 'Meena',
      lastName: 'Raveendran',
      gender: Gender.FEMALE,
      phoneVerifiedAt: new Date(),
      roles: { create: [{ roleId: userRole.id }, { roleId: restaurantRole.id }] },
      sharedRidePrefs: { create: {} },
      wallet: { create: {} },
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Jaffna Kitchen',
      slug: 'jaffna-kitchen',
      description: 'Northern-province home cooking',
      phone: '+94212222333',
      status: 'ACTIVE',
      isAcceptingOrders: true,
      defaultPrepMinutes: 25,
      commissionPct: D(15),
      minOrderAmount: D(500),
      addressLine: '12 Stanley Road, Jaffna',
      latitude: D('9.6640'),
      longitude: D('80.0290'),
      deliveryRadiusM: 12000,
      members: { create: { userId: owner.id, role: 'OWNER' } },
    },
  });

  const mains = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: 'Mains', sortOrder: 1 },
  });
  const sides = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: 'Sides', sortOrder: 2 },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        categoryId: mains.id,
        name: 'Jaffna crab curry',
        description: 'Slow-cooked with roasted spices',
        price: D(1450),
        available: true,
        sortOrder: 1,
      },
      {
        restaurantId: restaurant.id,
        categoryId: mains.id,
        name: 'Kottu roti',
        description: 'Chopped roti with vegetables and egg',
        price: D(780),
        available: true,
        sortOrder: 2,
      },
      {
        restaurantId: restaurant.id,
        categoryId: mains.id,
        name: 'Odiyal kool',
        description: 'Seafood broth — weekends only',
        price: D(1200),
        // Deliberately unavailable, so the "sold out" path can be exercised.
        available: false,
        sortOrder: 3,
      },
      {
        restaurantId: restaurant.id,
        categoryId: sides.id,
        name: 'Vadai',
        price: D(120),
        available: true,
        sortOrder: 1,
      },
    ],
  });
}

/**
 * DEVELOPMENT ONLY. A second courier, so two couriers racing for one delivery
 * can actually be demonstrated.
 */
async function seedSecondDemoCourier(password: string): Promise<void> {
  const phone = '+94770000098';
  if (await prisma.user.findFirst({ where: { phone } })) return;

  const userRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.USER } });
  const driverRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.DRIVER } });
  const bike = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'BIKE' } });

  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash: password,
      firstName: 'Vasanth',
      lastName: 'Thurairajah',
      gender: Gender.MALE,
      phoneVerifiedAt: new Date(),
      roles: { create: [{ roleId: userRole.id }, { roleId: driverRole.id }] },
      sharedRidePrefs: { create: {} },
      wallet: { create: {} },
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleTypeId: bike.id,
      plateNumber: 'NP-DEMO-02',
      make: 'Honda',
      model: 'CD 110',
      year: 2021,
      colour: 'Red',
      seatCapacity: 1,
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });

  const driver = await prisma.driver.create({
    data: {
      userId: user.id,
      licenceNumber: 'DEMO-LIC-0002',
      licenceExpiry: new Date('2030-01-01'),
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
      sharedRideOptIn: false,
      vehicles: { create: { vehicleId: vehicle.id, isPrimary: true } },
      availability: {
        create: {
          presence: 'ONLINE',
          activeVehicleId: vehicle.id,
          acceptsShared: false,
          acceptsFood: true,
          acceptsParcel: true,
          wentOnlineAt: new Date(),
        },
      },
    },
  });

  await prisma.$executeRaw`
    INSERT INTO driver_locations_current (driver_id, latitude, longitude, recorded_at, updated_at)
    VALUES (${driver.id}::uuid, 9.6650, 80.0300, now(), now())
    ON CONFLICT (driver_id) DO UPDATE
      SET latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          recorded_at = EXCLUDED.recorded_at
  `;
}

async function main(): Promise<void> {
  console.log('Seeding reference data…');
  await seedRoles();
  await seedVehicleTypes();
  await seedParcelTypes();
  await seedPricingRules();
  await seedSettings();
  await seedAdmin();
  await seedDemo();
  console.log('Done.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
