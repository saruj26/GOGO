import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tugo_mobile/core/errors/api_exception.dart';
import 'package:tugo_mobile/core/format/labels.dart';
import 'package:tugo_mobile/core/theme/app_theme.dart';
import 'package:tugo_mobile/core/widgets/payment_picker.dart';
import 'package:tugo_mobile/core/widgets/states.dart';
import 'package:tugo_mobile/core/widgets/status_badge.dart';
import 'package:tugo_mobile/features/rides/widgets/vehicle_option_tile.dart';
import 'package:tugo_mobile/features/shared_rides/widgets/shared_offer_card.dart';
import 'package:tugo_mobile/models/ride.dart';
import 'package:tugo_mobile/models/shared_ride.dart';

import '../support/fixtures.dart';

/// The smallest phone the application supports. Rendering everything at this
/// width is what catches an overflow before a person does.
const smallPhone = Size(320, 640);

Future<void> pumpAt(
  WidgetTester tester,
  Widget child, {
  Size size = smallPhone,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
}

VehicleEstimate carEstimate() => VehicleEstimate.fromJson(estimatesJson().first);

SharedRideOffer sampleOffer() =>
    SharedRideSearchResult.fromJson(sharedSearchJson()).offers.first;

void main() {
  group('VehicleOptionTile', () {
    testWidgets('shows the solo fare when sharing is not being considered', (tester) async {
      await pumpAt(
        tester,
        VehicleOptionTile(estimate: carEstimate(), selected: false, onTap: () {}),
      );

      expect(find.text('Car'), findsOneWidget);
      expect(find.text('LKR 1,240.00'), findsOneWidget);
      expect(find.textContaining('Save'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('shows the backend shared price and saving when sharing', (tester) async {
      await pumpAt(
        tester,
        VehicleOptionTile(
          estimate: carEstimate(),
          selected: true,
          showShared: true,
          onTap: () {},
        ),
      );

      // The shared price leads, the solo price is struck through, and the
      // saving is the server's figure verbatim.
      expect(find.text('LKR 868.00'), findsOneWidget);
      expect(find.text('LKR 1,240.00'), findsOneWidget);
      expect(find.text('Save 372.00'), findsOneWidget);
    });

    testWidgets('says plainly when a class cannot be shared', (tester) async {
      final tuk = VehicleEstimate.fromJson(estimatesJson()[1]);

      await pumpAt(
        tester,
        VehicleOptionTile(estimate: tuk, selected: false, showShared: true, onTap: () {}),
      );

      expect(find.text('Not available for sharing'), findsOneWidget);
    });

    testWidgets('reports selection to the caller', (tester) async {
      var tapped = 0;

      await pumpAt(
        tester,
        VehicleOptionTile(estimate: carEstimate(), selected: false, onTap: () => tapped++),
      );

      await tester.tap(find.text('Car'));
      expect(tapped, 1);
    });
  });

  group('SharedOfferCard', () {
    testWidgets('renders the whole offer at 320dp without overflowing', (tester) async {
      await pumpAt(tester, SharedOfferCard(offer: sampleOffer(), onSelect: () {}));

      expect(find.text('Kamal'), findsOneWidget);
      expect(find.text('LKR 868.00'), findsOneWidget);
      expect(find.text('Save 372.00'), findsOneWidget);
      expect(find.textContaining('120 m', findRichText: true), findsOneWidget);
      expect(find.text('Join this ride'), findsOneWidget);

      // A RenderFlex overflow surfaces here as an exception.
      expect(tester.takeException(), isNull);
    });

    testWidgets('says who else is aboard, including when nobody is', (tester) async {
      final alone = SharedRideOffer.fromJson({
        ...sharedSearchJson()['offers']![0] as Map<String, dynamic>,
        'coPassengerCount': 0,
      });

      await pumpAt(tester, SharedOfferCard(offer: alone, onSelect: () {}));
      expect(find.textContaining('No one yet', findRichText: true), findsOneWidget);
    });

    testWidgets('disables the action while a join is in flight', (tester) async {
      var joins = 0;

      await pumpAt(
        tester,
        SharedOfferCard(offer: sampleOffer(), busy: true, onSelect: () => joins++),
      );

      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
      expect(joins, 0);
    });
  });

  group('StatusBadge', () {
    testWidgets('shows the human label rather than the raw status', (tester) async {
      await pumpAt(
        tester,
        const StatusBadge(status: 'DRIVER_ARRIVING', labels: rideStatusLabel),
      );

      expect(find.text('Driver on the way'), findsOneWidget);
      expect(find.text('DRIVER_ARRIVING'), findsNothing);
    });

    testWidgets('a shared badge is visually distinct from a status', (tester) async {
      await pumpAt(tester, const SharedBadge());
      expect(find.text('Shared'), findsOneWidget);
      expect(find.byIcon(Icons.groups_rounded), findsOneWidget);
    });
  });

  group('PaymentPicker', () {
    testWidgets('offers cash and wallet and explains why card is absent', (tester) async {
      await pumpAt(
        tester,
        PaymentPicker(value: 'CASH', onChanged: (_) {}, walletBalance: '1500.00'),
      );

      expect(find.text('Cash'), findsOneWidget);
      expect(find.text('Wallet'), findsOneWidget);
      expect(find.text('Balance LKR 1,500.00'), findsOneWidget);
      // Stated rather than hidden.
      expect(
        find.text('Card and online payment are not available yet.'),
        findsOneWidget,
      );
    });

    testWidgets('a frozen wallet cannot be chosen and says why', (tester) async {
      await pumpAt(
        tester,
        PaymentPicker(value: 'CASH', onChanged: (_) {}, walletFrozen: true),
      );

      expect(find.text('Your wallet is on hold'), findsOneWidget);

      final wallet = tester.widget<RadioListTile<String>>(
        find.widgetWithText(RadioListTile<String>, 'Wallet'),
      );
      expect(wallet.enabled, isFalse);
    });
  });

  group('state widgets', () {
    testWidgets('an error offers a retry when a retry could help', (tester) async {
      var retried = 0;

      await pumpAt(
        tester,
        ErrorState(
          error: ApiException(
            kind: ApiErrorKind.network,
            message: 'You appear to be offline.',
          ),
          onRetry: () => retried++,
        ),
      );

      expect(find.text('You appear to be offline.'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);
    });

    testWidgets('a validation error offers no pointless retry', (tester) async {
      await pumpAt(
        tester,
        ErrorState(
          error: ApiException(
            kind: ApiErrorKind.validation,
            message: 'That parcel is too heavy.',
          ),
          onRetry: () {},
        ),
      );

      expect(find.text('That parcel is too heavy.'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('an empty state can carry an action', (tester) async {
      await pumpAt(
        tester,
        EmptyState(
          title: 'No rides yet',
          message: 'Your trips will appear here.',
          action: FilledButton(onPressed: () {}, child: const Text('Book a ride')),
        ),
      );

      expect(find.text('No rides yet'), findsOneWidget);
      expect(find.text('Book a ride'), findsOneWidget);
    });

    testWidgets('an info note states a limitation instead of hiding it', (tester) async {
      await pumpAt(
        tester,
        const InfoNote(message: 'Live driver position is not available yet.'),
      );

      expect(find.text('Live driver position is not available yet.'), findsOneWidget);
    });
  });

  group('layout across device widths', () {
    for (final width in [320.0, 360.0, 375.0, 390.0, 414.0, 768.0]) {
      testWidgets('the shared offer card fits at ${width.toInt()}dp', (tester) async {
        await pumpAt(
          tester,
          SharedOfferCard(offer: sampleOffer(), onSelect: () {}),
          size: Size(width, 800),
        );

        expect(tester.takeException(), isNull);
      });

      testWidgets('the vehicle tile fits at ${width.toInt()}dp', (tester) async {
        await pumpAt(
          tester,
          VehicleOptionTile(
            estimate: carEstimate(),
            selected: true,
            showShared: true,
            onTap: () {},
          ),
          size: Size(width, 800),
        );

        expect(tester.takeException(), isNull);
      });
    }
  });
}
