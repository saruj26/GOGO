import '../../../models/common.dart';
import '../../../models/support.dart';
import '../api_client.dart';

/// The customer's own tickets. Every route is scoped to the caller by the
/// backend — there is no path here that takes another person's id.
class SupportApi {
  const SupportApi(this._client);

  final ApiClient _client;

  Future<SupportTicketSummary> create({
    required String subject,
    required String category,
    required String description,
    String? referenceType,
    String? referenceId,
  }) async {
    final data = await _client.post<Map<String, dynamic>>(
      '/support/tickets',
      body: {
        'subject': subject,
        'category': category,
        'description': description,
        'referenceType': ?referenceType,
        'referenceId': ?referenceId,
      },
    );
    return SupportTicketSummary.fromJson(data);
  }

  Future<CursorPage<SupportTicketSummary>> list({String? cursor, int? limit}) async {
    final data = await _client.get<Map<String, dynamic>>(
      '/support/tickets',
      query: {'cursor': cursor, 'limit': limit},
    );
    return CursorPage.fromJson(data, SupportTicketSummary.fromJson);
  }

  Future<SupportTicketDetail> get(String ticketId) async {
    final data = await _client.get<Map<String, dynamic>>('/support/tickets/$ticketId');
    return SupportTicketDetail.fromJson(data);
  }

  Future<void> reply(String ticketId, String body) =>
      _client.post<dynamic>('/support/tickets/$ticketId/messages', body: {'body': body});

  Future<void> close(String ticketId) =>
      _client.post<dynamic>('/support/tickets/$ticketId/close');
}
