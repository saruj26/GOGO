import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/api_exception.dart';
import '../../core/location/location_providers.dart';
import '../../core/location/location_service.dart';
import '../../core/providers.dart';
import '../../core/widgets/states.dart';
import '../../models/common.dart';

/// Address search.
///
/// Returns the chosen [Place] via `Navigator.pop`, so the calling screen keeps
/// ownership of what the journey is.
class LocationSearchScreen extends ConsumerStatefulWidget {
  const LocationSearchScreen({super.key, required this.title, this.initialQuery});

  final String title;
  final String? initialQuery;

  @override
  ConsumerState<LocationSearchScreen> createState() => _LocationSearchScreenState();
}

class _LocationSearchScreenState extends ConsumerState<LocationSearchScreen> {
  final _controller = TextEditingController();

  Timer? _debounce;
  CancelToken? _inFlight;

  List<Place> _results = const [];
  String? _attribution;
  bool _searching = false;
  Object? _error;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialQuery != null) _controller.text = widget.initialQuery!;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _inFlight?.cancel();
    _controller.dispose();
    super.dispose();
  }

  /// Debounced so a five-letter street name is one request, not five, and the
  /// previous request is cancelled so a slow early answer cannot overwrite a
  /// newer one.
  void _onChanged(String value) {
    _debounce?.cancel();

    if (value.trim().length < 3) {
      _inFlight?.cancel();
      setState(() {
        _results = const [];
        _searching = false;
        _error = null;
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value.trim()));
  }

  Future<void> _search(String query) async {
    _inFlight?.cancel();
    final token = CancelToken();
    _inFlight = token;

    setState(() {
      _searching = true;
      _error = null;
    });

    try {
      final near = ref.read(lastKnownLocationProvider).value?.point;
      final result =
          await ref.read(apiProvider).places.search(query, near: near, cancelToken: token);

      if (!mounted || token.isCancelled) return;
      setState(() {
        _results = result.results;
        _attribution = result.attribution;
        _searching = false;
      });
    } on ApiException catch (error) {
      if (!mounted || token.isCancelled || error.kind == ApiErrorKind.cancelled) return;
      setState(() {
        _error = error;
        _searching = false;
      });
    }
  }

  /// Turns the device's position into an address the backend recognises.
  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);

    try {
      final fix = await ref.read(locationServiceProvider).current();
      final place = await ref.read(apiProvider).places.reverse(fix.point);

      if (!mounted) return;
      Navigator.of(context).pop(place);
    } on LocationFailure catch (failure) {
      if (!mounted) return;
      setState(() => _locating = false);
      _showLocationProblem(failure);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _locating = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  void _showLocationProblem(LocationFailure failure) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(failure.message),
        action: failure.reason == LocationDenial.permissionDeniedForever
            ? SnackBarAction(
                label: 'Settings',
                onPressed: () => ref.read(locationServiceProvider).openSettings(),
              )
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final saved = ref.watch(savedPlacesProvider);
    final theme = Theme.of(context);
    final query = _controller.text.trim();

    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Search for a place or address',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _controller.clear();
                            _onChanged('');
                          },
                        ),
                ),
              ),
            ),
            ListTile(
              leading: _locating
                  ? const SizedBox(
                      height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : const Icon(Icons.my_location),
              title: const Text('Use my current location'),
              onTap: _locating ? null : _useCurrentLocation,
            ),
            const Divider(),
            Expanded(child: _buildResults(saved, query, theme)),
            if (_attribution != null && _results.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text(
                  _attribution!,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(AsyncValue<List<SavedPlace>> saved, String query, ThemeData theme) {
    if (_error != null) {
      return ErrorState(error: _error!, onRetry: () => _search(query));
    }

    if (_searching && _results.isEmpty) {
      return const LoadingState();
    }

    // With no query the useful thing to show is the places they saved, not an
    // empty list.
    if (query.length < 3) {
      return saved.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(error: error, compact: true),
        data: (places) => places.isEmpty
            ? const EmptyState(
                title: 'Search for a place',
                message: 'Type at least three characters, or save places you use often.',
                icon: Icons.place_outlined,
              )
            : ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: Text('Saved places', style: theme.textTheme.labelLarge),
                  ),
                  for (final place in places)
                    ListTile(
                      leading: const Icon(Icons.bookmark_outline),
                      title: Text(place.label),
                      subtitle: Text(place.address, maxLines: 2, overflow: TextOverflow.ellipsis),
                      onTap: () => Navigator.of(context).pop(place.place),
                    ),
                ],
              ),
      );
    }

    if (_results.isEmpty) {
      return const EmptyState(
        title: 'Nothing found',
        message: 'Try a different spelling, or a nearby landmark.',
        icon: Icons.search_off_rounded,
      );
    }

    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final place = _results[index];
        return ListTile(
          leading: const Icon(Icons.place_outlined),
          title: Text(place.address, maxLines: 2, overflow: TextOverflow.ellipsis),
          onTap: () => Navigator.of(context).pop(place),
        );
      },
    );
  }
}

final savedPlacesProvider = FutureProvider<List<SavedPlace>>(
  (ref) => ref.watch(apiProvider).places.saved(),
);
