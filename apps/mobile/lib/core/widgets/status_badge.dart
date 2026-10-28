import 'package:flutter/material.dart';

import '../format/labels.dart';
import '../theme/app_theme.dart';

/// A lifecycle status, coloured by tone rather than by service.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status, required this.labels, this.dense = false});

  final String status;
  final Map<String, String> labels;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final tone = toneFor(status);
    final colour = switch (tone) {
      StatusTone.success => AppColors.success,
      StatusTone.danger => AppColors.danger,
      StatusTone.warning => AppColors.warning,
      StatusTone.progress => AppColors.progress,
      StatusTone.neutral => Theme.of(context).colorScheme.outline,
    };

    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 10, vertical: dense ? 3 : 5),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        labelFor(labels, status),
        style: TextStyle(
          // 12sp is the floor for a label that must stay readable on a
          // 320dp-wide screen.
          fontSize: dense ? 12 : 13,
          fontWeight: FontWeight.w600,
          color: colour,
        ),
      ),
    );
  }
}

/// Marks a journey as shared. Deliberately distinct from every status badge so
/// a shared ride reads differently from a solo one at a glance.
class SharedBadge extends StatelessWidget {
  const SharedBadge({super.key, this.label = 'Shared'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.shared.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.groups_rounded, size: 14, color: AppColors.shared),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.shared,
            ),
          ),
        ],
      ),
    );
  }
}
