import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/common.dart';
import '../theme/app_theme.dart';
import 'polyline.dart';

/// What to draw on a map, expressed in the application's own terms.
///
/// Screens describe pins and a route; they never touch the tile provider. That
/// is what lets the provider change without editing every screen.
class MapMarker {
  const MapMarker({
    required this.point,
    required this.kind,
    this.label,
  });

  final GeoPoint point;
  final MapMarkerKind kind;
  final String? label;
}

enum MapMarkerKind { pickup, dropoff, stop, vehicle, restaurant, me }

/// A map with pins and an optional route line.
///
/// It renders only what it is given. Nothing here interpolates a position or
/// animates a vehicle between two points: a marker on this map is somewhere the
/// backend actually said something was.
class MapView extends StatefulWidget {
  const MapView({
    super.key,
    required this.tileUrlTemplate,
    required this.attribution,
    this.markers = const [],
    this.routePolyline,
    this.centre,
    this.zoom = 13,
    this.interactive = true,
    this.height,
    this.onTap,
  });

  final String tileUrlTemplate;
  final String attribution;
  final List<MapMarker> markers;
  final String? routePolyline;
  final GeoPoint? centre;
  final double zoom;
  final bool interactive;
  final double? height;
  final void Function(GeoPoint point)? onTap;

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> {
  final MapController _controller = MapController();
  bool _ready = false;

  @override
  void didUpdateWidget(covariant MapView oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (!_ready) return;
    if (oldWidget.routePolyline != widget.routePolyline ||
        oldWidget.markers.length != widget.markers.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
    }
  }

  /// Frames the whole journey rather than a fixed zoom, so a 2 km trip and a
  /// 60 km one are both legible without the person pinching.
  void _fit() {
    final points = <GeoPoint>[
      ...decodePolyline(widget.routePolyline),
      ...widget.markers.map((marker) => marker.point),
    ];

    final bounds = GeoBounds.of(points);
    if (bounds == null || !mounted) return;

    if (points.length == 1) {
      _controller.move(LatLng(points.first.lat, points.first.lng), 15);
      return;
    }

    _controller.fitCamera(
      CameraFit.bounds(
        bounds: LatLngBounds(
          LatLng(bounds.minLat, bounds.minLng),
          LatLng(bounds.maxLat, bounds.maxLng),
        ),
        padding: const EdgeInsets.all(48),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final route = decodePolyline(widget.routePolyline);
    final fallbackCentre = widget.centre ??
        (widget.markers.isNotEmpty ? widget.markers.first.point : null) ??
        (route.isNotEmpty ? route.first : null) ??
        // Colombo. Only ever seen for the instant before a real position or
        // route arrives.
        const GeoPoint(lat: 6.9271, lng: 79.8612);

    final map = FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: LatLng(fallbackCentre.lat, fallbackCentre.lng),
        initialZoom: widget.zoom,
        interactionOptions: InteractionOptions(
          flags: widget.interactive
              ? InteractiveFlag.pinchZoom | InteractiveFlag.drag | InteractiveFlag.doubleTapZoom
              : InteractiveFlag.none,
        ),
        onMapReady: () {
          _ready = true;
          _fit();
        },
        onTap: widget.onTap == null
            ? null
            : (_, point) => widget.onTap!(GeoPoint(lat: point.latitude, lng: point.longitude)),
      ),
      children: [
        TileLayer(
          urlTemplate: widget.tileUrlTemplate,
          // Required by the tile provider's usage policy.
          userAgentPackageName: 'lk.tugo.mobile',
          maxNativeZoom: 19,
        ),
        if (route.length > 1)
          PolylineLayer(
            polylines: [
              Polyline(
                points: route.map((p) => LatLng(p.lat, p.lng)).toList(growable: false),
                strokeWidth: 5,
                color: AppColors.brand,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            for (final marker in widget.markers)
              Marker(
                point: LatLng(marker.point.lat, marker.point.lng),
                width: 40,
                height: 40,
                alignment: Alignment.topCenter,
                child: _Pin(kind: marker.kind),
              ),
          ],
        ),
        Align(
          alignment: Alignment.bottomRight,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            color: Colors.white.withValues(alpha: 0.75),
            child: Text(
              widget.attribution,
              // 11sp is the floor for legibility; the attribution is a legal
              // requirement of the tile source, not decoration.
              style: const TextStyle(fontSize: 11, color: Colors.black87),
            ),
          ),
        ),
      ],
    );

    if (widget.height == null) return map;

    return SizedBox(height: widget.height, child: map);
  }
}

class _Pin extends StatelessWidget {
  const _Pin({required this.kind});

  final MapMarkerKind kind;

  @override
  Widget build(BuildContext context) {
    final (icon, colour) = switch (kind) {
      MapMarkerKind.pickup => (Icons.trip_origin, AppColors.brand),
      MapMarkerKind.dropoff => (Icons.place, AppColors.danger),
      MapMarkerKind.stop => (Icons.adjust, AppColors.shared),
      MapMarkerKind.vehicle => (Icons.local_taxi, AppColors.progress),
      MapMarkerKind.restaurant => (Icons.storefront, AppColors.warning),
      MapMarkerKind.me => (Icons.my_location, AppColors.progress),
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 4)],
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon, size: 20, color: colour),
      ),
    );
  }
}
