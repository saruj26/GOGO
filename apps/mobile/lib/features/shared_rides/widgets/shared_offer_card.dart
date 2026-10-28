import 'package:flutter/material.dart';

import '../../../core/format/format.dart' as fmt;
import '../../../core/theme/app_theme.dart';
import '../../../models/shared_ride.dart';

/// One shared ride the matching engine offered.
///
/// Everything shown here is the backend's answer: which ride, how far the walk
/// is at each end, when it will arrive, what it costs and what it saves. The
/// card renders that and adds nothing of its own — it has no idea what makes
/// two journeys compatible.
class SharedOfferCard extends StatelessWidget {
  const SharedOfferCard({
    super.key,
    required this.offer,
    required this.onSelect,
    this.busy = false,
  });

  final SharedRideOffer offer;
  final VoidCallback onSelect;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final driver = offer.driver;
    final vehicle = offer.vehicle;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.shared.withValues(alpha: 0.15),
                  child: Text(
                    driver == null || driver.firstName.isEmpty
                        ? '?'
                        : driver.firstName[0].toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.shared,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Gap.md,
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        driver?.firstName ?? 'Driver',
                        style: theme.textTheme.titleSmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        [
                          if (driver?.rating != null) '★ ${driver!.rating}',
                          if (vehicle != null) vehicle.description,
                          if (offer.vehicleTypeName != null) offer.vehicleTypeName!,
                        ].join(' · '),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      fmt.money(offer.fare.total, currency: offer.fare.currency),
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Save ${fmt.amount(offer.saving)}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.shared,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            Gap.md,
            const Divider(height: 1),
            Gap.md,
            _Fact(
              icon: Icons.schedule_rounded,
              label: 'Picks you up',
              value: fmt.clockTime(offer.estimatedPickupAt),
            ),
            _Fact(
              icon: Icons.flag_outlined,
              label: 'Drops you off',
              value: fmt.clockTime(offer.estimatedDropoffAt),
            ),
            _Fact(
              icon: Icons.directions_walk_rounded,
              label: 'Walk',
              value:
                  '${fmt.distance(offer.pickupWalkMeters)} to pickup · ${fmt.distance(offer.dropoffWalkMeters)} at the end',
            ),
            _Fact(
              icon: Icons.groups_rounded,
              label: 'Sharing with',
              value: offer.coPassengerCount == 0
                  ? 'No one yet — you would be first'
                  : '${offer.coPassengerCount} ${offer.coPassengerCount == 1 ? 'passenger' : 'passengers'}',
            ),
            Gap.md,
            FilledButton(
              onPressed: busy ? null : onSelect,
              style: FilledButton.styleFrom(backgroundColor: AppColors.shared),
              child: busy
                  ? const SizedBox(
                      height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : const Text('Join this ride'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: theme.colorScheme.outline),
          Gap.sm,
          Expanded(
            child: RichText(
              text: TextSpan(
                style: theme.textTheme.bodySmall,
                children: [
                  TextSpan(
                    text: '$label  ',
                    style: TextStyle(color: theme.colorScheme.outline),
                  ),
                  TextSpan(
                    text: value,
                    style: TextStyle(
                      color: theme.colorScheme.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
