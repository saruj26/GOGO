import 'package:flutter/material.dart';

/// The Tugo wordmark: "tugo" in a bold, rounded weight so it reads clearly
/// at any size without needing a shipped image.
class TugoWordmark extends StatelessWidget {
  const TugoWordmark({super.key, this.size = 56, this.color = Colors.white});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: size * 1.3,
      child: FittedBox(
        fit: BoxFit.contain,
        child: Text(
          'tugo',
          style: TextStyle(
            fontSize: size,
            fontWeight: FontWeight.w800,
            color: color,
            height: 1,
            letterSpacing: -1.5,
          ),
        ),
      ),
    );
  }
}

/// The Tugo geometric mark: a solid circle and a solid rounded rectangle.
/// Used as the static app icon/favicon source and as the base shapes for the
/// startup loading animation — the mark and the loader are the same two
/// shapes, one animated.
class TugoMark extends StatelessWidget {
  const TugoMark({
    super.key,
    this.size = 70,
    this.color = Colors.white,
    this.circleOffset = Offset.zero,
    this.rectRotation = 0,
  });

  final double size;
  final Color color;

  /// Horizontal slide applied to the circle, in logical pixels.
  final Offset circleOffset;

  /// Rotation applied to the rounded rectangle, in radians.
  final double rectRotation;

  @override
  Widget build(BuildContext context) {
    final shapeSize = size * 0.46;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Transform.translate(
            offset: Offset(-size * 0.14, 0) + circleOffset,
            child: Container(
              width: shapeSize,
              height: shapeSize,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
          Transform.translate(
            offset: Offset(size * 0.14, 0),
            child: Transform.rotate(
              angle: rectRotation,
              child: Container(
                width: shapeSize * 1.15,
                height: shapeSize * 0.62,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(shapeSize * 0.31),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
