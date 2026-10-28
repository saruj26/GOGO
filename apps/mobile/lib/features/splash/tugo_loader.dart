import 'package:flutter/material.dart';

import '../../core/theme/brand_mark.dart';

/// The branded loading symbol: the circle slides, the rounded rectangle
/// rotates ~20°, they overlap and separate, in a seamless 1.8s ease-in-out
/// loop. No spinners, no icons, no text — just the two Tugo mark shapes.
class TugoLoader extends StatefulWidget {
  const TugoLoader({super.key, this.size = 70});

  final double size;

  @override
  State<TugoLoader> createState() => _TugoLoaderState();
}

class _TugoLoaderState extends State<TugoLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curved = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);

    return AnimatedBuilder(
      animation: curved,
      builder: (context, child) {
        final t = curved.value;
        return TugoMark(
          size: widget.size,
          circleOffset: Offset(widget.size * 0.3 * t, 0),
          rectRotation: 0.35 * t, // ~20 degrees at full swing
        );
      },
    );
  }
}
