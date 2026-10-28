import 'package:flutter_test/flutter_test.dart';
import 'package:rideflow_mobile/core/errors/api_exception.dart';
import 'package:rideflow_mobile/core/providers.dart';

import '../support/fake_http.dart';
import '../support/fixtures.dart';
import '../support/harness.dart';

void main() {
  group('support tickets', () {
    test('raises a ticket with a category the backend accepts', () async {
      final http = FakeHttp()
        ..on(
          'POST /support/tickets',
          Reply.ok({
            'id': 'ticket-1',
            'reference': 'SP-4X2K9M',
            'status': 'OPEN',
            'createdAt': '2026-09-10T08:00:00.000Z',
          }),
        );

      final container = buildContainer(http, session: sessionTokens);

      final ticket = await container.read(apiProvider).support.create(
            subject: 'Driver did not arrive',
            category: 'RIDE',
            description: 'I waited twenty minutes and nobody came.',
          );

      expect(ticket.reference, 'SP-4X2K9M');
      expect(ticket.status, 'OPEN');

      final sent = http.forRoute('POST /support/tickets').single.body as Map;
      expect(sent['category'], 'RIDE');
      // No reference is attached unless the customer picked one.
      expect(sent.containsKey('referenceId'), isFalse);
    });

    test('attaches the ride a complaint is about', () async {
      final http = FakeHttp()
        ..on(
          'POST /support/tickets',
          Reply.ok({'id': 't', 'reference': 'SP-1', 'status': 'OPEN'}),
        );

      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).support.create(
            subject: 'Charged twice',
            category: 'PAYMENT',
            description: 'My card shows two charges for the same trip.',
            referenceType: 'RIDE',
            referenceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          );

      final sent = http.forRoute('POST /support/tickets').single.body as Map;
      expect(sent['referenceType'], 'RIDE');
    });

    test('refuses to attach something that is not the customer’s', () async {
      // The backend answers the same way whether it exists or belongs to
      // somebody else, so a ticket cannot be used to probe for ride ids.
      final http = FakeHttp()
        ..on(
          'POST /support/tickets',
          Reply.error(400, 'VALIDATION_FAILED', 'We could not find that in your account.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      await expectLater(
        container.read(apiProvider).support.create(
              subject: 'Not mine',
              category: 'RIDE',
              description: 'Attaching a ride I do not own.',
              referenceType: 'RIDE',
              referenceId: '9c858901-8a57-4791-81fe-4c455b099bc9',
            ),
        throwsA(isA<ApiException>()),
      );
    });

    test('reads a conversation and knows who wrote each message', () async {
      final http = FakeHttp()
        ..on(
          'GET /support/tickets/ticket-1',
          Reply.ok({
            'id': 'ticket-1',
            'reference': 'SP-4X2K9M',
            'subject': 'Driver did not arrive',
            'category': 'RIDE',
            'status': 'IN_PROGRESS',
            'createdAt': '2026-09-10T08:00:00.000Z',
            'messages': [
              {
                'id': 'm1',
                'body': 'I waited twenty minutes.',
                'createdAt': '2026-09-10T08:00:00.000Z',
                'fromSupport': false,
                'authorFirstName': 'Nimal',
              },
              {
                'id': 'm2',
                'body': 'We are looking into it.',
                'createdAt': '2026-09-10T08:30:00.000Z',
                'fromSupport': true,
                'authorFirstName': 'Support',
              },
            ],
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final ticket = await container.read(apiProvider).support.get('ticket-1');

      expect(ticket.messages, hasLength(2));
      expect(ticket.messages[0].fromSupport, isFalse);
      expect(ticket.messages[1].fromSupport, isTrue);
      expect(ticket.isClosed, isFalse);
    });

    test('a closed ticket is closed', () async {
      final http = FakeHttp()
        ..on(
          'GET /support/tickets/ticket-2',
          Reply.ok({
            'id': 'ticket-2',
            'reference': 'SP-2',
            'subject': 'Old issue',
            'category': 'OTHER',
            'status': 'CLOSED',
            'messages': const [],
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final ticket = await container.read(apiProvider).support.get('ticket-2');

      expect(ticket.isClosed, isTrue);
    });

    test('a ticket waiting on the customer is flagged as needing them', () async {
      final http = FakeHttp()
        ..on(
          'GET /support/tickets',
          Reply.ok({
            'items': [
              {
                'id': 't1',
                'reference': 'SP-1',
                'subject': 'Refund',
                'category': 'PAYMENT',
                'status': 'WAITING_ON_USER',
                '_count': {'messages': 3},
                'createdAt': '2026-09-10T08:00:00.000Z',
                'updatedAt': '2026-09-10T09:00:00.000Z',
              },
            ],
            'hasMore': false,
          }),
        );

      final container = buildContainer(http, session: sessionTokens);
      final page = await container.read(apiProvider).support.list();

      expect(page.items.single.needsYou, isTrue);
      expect(page.items.single.messageCount, 3);
    });
  });

  group('profile editing', () {
    test('sends only the fields that were given', () async {
      final http = FakeHttp()..on('PUT /auth/me', Reply.ok(meJson()));
      final container = buildContainer(http, session: sessionTokens);

      await container.read(apiProvider).auth.updateProfile(
            firstName: 'Nimal',
            email: 'nimal@example.lk',
          );

      final sent = http.forRoute('PUT /auth/me').single.body as Map;
      expect(sent['firstName'], 'Nimal');
      expect(sent['email'], 'nimal@example.lk');
      // Nothing else is touched, so sending one field cannot blank the rest.
      expect(sent.containsKey('lastName'), isFalse);
      expect(sent.containsKey('gender'), isFalse);
      // Phone is never offered: it is the login identifier.
      expect(sent.containsKey('phone'), isFalse);
    });

    test('returns the profile the server stored', () async {
      final http = FakeHttp()..on('PUT /auth/me', Reply.ok(meJson()));
      final container = buildContainer(http, session: sessionTokens);

      final me = await container.read(apiProvider).auth.updateProfile(firstName: 'Nimal');
      expect(me.firstName, 'Nimal');
    });

    test('surfaces an email already in use', () async {
      final http = FakeHttp()
        ..on(
          'PUT /auth/me',
          Reply.error(409, 'CONFLICT', 'That email address is already in use.'),
        );

      final container = buildContainer(http, session: sessionTokens);

      try {
        await container.read(apiProvider).auth.updateProfile(email: 'taken@example.lk');
        fail('expected a conflict');
      } on ApiException catch (error) {
        expect(error.kind, ApiErrorKind.conflict);
        expect(error.message, 'That email address is already in use.');
      }
    });
  });
}
