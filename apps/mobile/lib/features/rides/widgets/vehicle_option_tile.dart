import 'package:flutter/material.dart';

import '../../../core/format/format.dart' as fmt;
import '../../../core/theme/app_theme.dart';
import '../../../models/ride.dart';

/// One vehicle class, with the price the backend quoted for it.
///
/// When shared riding is being considered the tile shows the backend's shared
/// starting price and its saving. Neither is computed here — a saving shown to
/// a passenger has to be the one the server will honour.
class VehicleOptionTile extends StatelessWidget {
  const VehicleOptionTile({
    super.key,
    required this.estimate,
    required this.selected,
    required this.onTap,
    this.showShared = false,
  });

  final VehicleEstimate estimate;
  final bool selected;
  final VoidCallback onTap;
  final bool showShared;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sharedPrice = estimate.sharedFareFrom;
    final saving = estimate.sharedSaving;
    final showSharedPricing = showShared && estimate.sharedRideEligible && sharedPrice != null;

    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? theme.colorScheme.primary : theme.colorScheme.outlineVariant,
              width: selected ? 2 : 1,
            ),
            color: selected ? theme.colorScheme.primaryContainer.withValues(alpha: 0.35) : null,
          ),
          child: Row(
            children: [
              Icon(
                _iconFor(estimate.code),
                size: 30,
                color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
              ),
              Gap.md,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            estimate.name,
                            style: theme.textTheme.titleSmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (showShared && estimate.sharedRideEligible) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.groups_rounded, size: 15, color: AppColors.shared),
                        ],
                      ],
                    ),
                    Text(
                      '${estimate.seatCapacity} seats · ${fmt.duration(estimate.durationS)} · ${fmt.distance(estimate.distanceM)}',
                      style:
                          theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                    ),
                    if (showShared && !estimate.sharedRideEligible)
                      Text(
                        'Not available for sharing',
                        style:
                            theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                      ),
                  ],
                ),
              ),
              Gap.sm,
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    fmt.money(
                      showSharedPricing ? sharedPrice : estimate.soloFare,
                      currency: estimate.currency,
                    ),
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (showSharedPricing) ...[
                    Text(
                      fmt.money(estimate.soloFare, currency: estimate.currency),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.outline,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    if (saving != null)
                      Text(
                        'Save ${fmt.amount(saving)}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.shared,
                        ),
                      ),
                  ] else
                    Text(
                      '${estimate.etaMinutes} min away',
                      style:
                          theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Vehicle classes come from the backend, so this maps a known code to an
  /// icon and falls back to a generic car for anything it has not seen. It is
  /// presentation only — no behaviour depends on the class code.
  IconData _iconFor(String code) => switch (code.toUpperCase()) {
        'BIKE' || 'MOTORBIKE' => Icons.two_wheeler,
        'TUKTUK' || 'THREEWHEEL' || 'AUTO' => Icons.electric_rickshaw,
        'VAN' || 'MINIVAN' => Icons.airport_shuttle,
        'LORRY' || 'TRUCK' => Icons.local_shipping,
        _ => Icons.directions_car,
      };
}
