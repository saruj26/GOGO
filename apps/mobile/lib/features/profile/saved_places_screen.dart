import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/states.dart';
import '../../models/common.dart';
import '../rides/location_search_screen.dart';

class SavedPlacesScreen extends ConsumerWidget {
  const SavedPlacesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final places = ref.watch(savedPlacesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Saved places')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add place'),
      ),
      body: places.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(savedPlacesProvider)),
        data: (list) => list.isEmpty
            ? const EmptyState(
                title: 'No saved places',
                message: 'Save the places you travel to often so booking takes one tap.',
                icon: Icons.bookmark_outline,
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                itemCount: list.length,
                separatorBuilder: (_, _) => Gap.sm,
                itemBuilder: (context, index) {
                  final place = list[index];

                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.bookmark_outline),
                      title: Text(place.label),
                      subtitle: Text(place.address, maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: IconButton(
                        tooltip: 'Remove',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _remove(context, ref, place),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final place = await Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => const LocationSearchScreen(title: 'Find a place')),
    );

    if (place == null || !context.mounted) return;

    final labelController = TextEditingController();
    final label = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Name this place'),
        content: TextField(
          controller: labelController,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'e.g. Home, Work, Gym'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, labelController.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (label == null || label.isEmpty || !context.mounted) return;

    try {
      await ref.read(apiProvider).places.save(
            label: label,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
          );
      ref.invalidate(savedPlacesProvider);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _remove(BuildContext context, WidgetRef ref, SavedPlace place) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${place.label}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(apiProvider).places.removeSaved(place.id);
      ref.invalidate(savedPlacesProvider);
    } on ApiException catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}
