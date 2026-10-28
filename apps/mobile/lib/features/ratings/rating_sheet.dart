import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';

/// Collects a rating for a completed ride, food order or parcel.
///
/// The backend refuses a second rating for the same job, and refuses one for
/// something not finished. That is what actually prevents duplicates; this
/// sheet simply reports the refusal rather than trying to be the rule.
Future<bool?> showRatingSheet(
  BuildContext context, {
  required String kind,
  required String id,
  required String title,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _RatingSheet(kind: kind, id: id, title: title),
  );
}

class _RatingSheet extends ConsumerStatefulWidget {
  const _RatingSheet({required this.kind, required this.id, required this.title});

  final String kind;
  final String id;
  final String title;

  @override
  ConsumerState<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends ConsumerState<_RatingSheet> {
  final _comment = TextEditingController();
  int _score = 0;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_score == 0) {
      setState(() => _error = 'Choose a rating first.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(apiProvider).ratings.rate(
            kind: widget.kind,
            id: widget.id,
            score: _score,
            comment: _comment.text.trim(),
          );

      if (!mounted) return;
      Navigator.of(context).pop(true);
      ref.invalidate(pendingRatingsProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 4,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: theme.textTheme.titleLarge),
          Gap.lg,
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var star = 1; star <= 5; star++)
                IconButton(
                  // 48dp targets so the stars are separable with a thumb.
                  iconSize: 36,
                  constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                  tooltip: '$star ${star == 1 ? 'star' : 'stars'}',
                  onPressed: _busy ? null : () => setState(() => _score = star),
                  icon: Icon(
                    star <= _score ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: star <= _score ? AppColors.warning : theme.colorScheme.outline,
                  ),
                ),
            ],
          ),
          Gap.lg,
          AppField(
            label: 'Comment (optional)',
            controller: _comment,
            maxLines: 3,
            maxLength: 500,
            hint: 'Anything you would like us to know',
            enabled: !_busy,
          ),
          if (_error != null) ...[Gap.md, FormError(message: _error!)],
          Gap.lg,
          BusyButton(label: 'Submit rating', busy: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}

final pendingRatingsProvider = FutureProvider(
  (ref) => ref.watch(apiProvider).ratings.pending(),
);
