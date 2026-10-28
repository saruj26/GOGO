import { Gender, SharedRideGenderPreference } from '@prisma/client';

export interface RiderSafetyProfile {
  /** Who this rider is willing to share with. */
  preference: SharedRideGenderPreference;
  /** This rider's own gender, used to satisfy other riders' preferences. */
  gender: Gender;
}

/**
 * Does `subject`'s stated preference admit a co-rider of gender `otherGender`?
 *
 * UNDISCLOSED and OTHER deliberately fail WOMEN_ONLY, MEN_ONLY and
 * SAME_GENDER_ONLY. A restriction that cannot be positively verified is treated
 * as unsatisfied — the safe direction to fail in.
 */
export function preferenceAdmits(
  subject: RiderSafetyProfile,
  otherGender: Gender,
): boolean {
  switch (subject.preference) {
    case SharedRideGenderPreference.ANY:
      return true;

    case SharedRideGenderPreference.WOMEN_ONLY:
      return otherGender === Gender.FEMALE;

    case SharedRideGenderPreference.MEN_ONLY:
      return otherGender === Gender.MALE;

    case SharedRideGenderPreference.SAME_GENDER_ONLY:
      return (
        (subject.gender === Gender.MALE || subject.gender === Gender.FEMALE) &&
        otherGender === subject.gender
      );

    default:
      // An unrecognised preference is treated as the most restrictive case.
      return false;
  }
}

/**
 * Whether a joining rider and an existing rider may share a vehicle.
 *
 * This is a HARD constraint. It is evaluated before any scoring and is never
 * traded off against a lower fare, a shorter detour or a better ETA.
 *
 * @param requireMutual When true (the default policy), BOTH riders' preferences
 *   must be satisfied. A woman who has asked for women-only passengers is
 *   protected even when the person joining has expressed no preference at all.
 */
export function ridersCompatible(
  joiner: RiderSafetyProfile,
  existing: RiderSafetyProfile,
  requireMutual: boolean,
): boolean {
  const joinerAccepts = preferenceAdmits(joiner, existing.gender);
  if (!joinerAccepts) {
    return false;
  }
  if (!requireMutual) {
    return true;
  }
  return preferenceAdmits(existing, joiner.gender);
}

/**
 * Evaluates a joining rider against every rider already on the ride, and
 * optionally against the driver.
 *
 * @returns true only if every pairwise check passes.
 */
export function joinerCompatibleWithAll(
  joiner: RiderSafetyProfile,
  existingRiders: readonly RiderSafetyProfile[],
  options: {
    requireMutual: boolean;
    driverGender?: Gender;
    applyToDriver: boolean;
  },
): boolean {
  for (const existing of existingRiders) {
    if (!ridersCompatible(joiner, existing, options.requireMutual)) {
      return false;
    }
  }

  if (options.applyToDriver && options.driverGender !== undefined) {
    if (!preferenceAdmits(joiner, options.driverGender)) {
      return false;
    }
  }

  return true;
}
