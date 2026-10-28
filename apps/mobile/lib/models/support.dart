import 'common.dart';

/// The categories the backend accepts. Sending anything else is rejected, so
/// the list is stated once here rather than typed into a screen.
const supportCategories = <String, String>{
  'RIDE': 'A ride',
  'SHARED_RIDE': 'A shared ride',
  'FOOD': 'A food order',
  'PARCEL': 'A parcel',
  'PAYMENT': 'A payment',
  'ACCOUNT': 'My account',
  'SAFETY': 'Safety',
  'OTHER': 'Something else',
};

const supportStatusLabel = <String, String>{
  'OPEN': 'Open',
  'IN_PROGRESS': 'Being looked at',
  'WAITING_ON_USER': 'Waiting for you',
  'RESOLVED': 'Resolved',
  'CLOSED': 'Closed',
};

class SupportTicketSummary {
  const SupportTicketSummary({
    required this.id,
    required this.reference,
    required this.subject,
    required this.category,
    required this.status,
    required this.messageCount,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String reference;
  final String subject;
  final String category;
  final String status;
  final int messageCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get needsYou => status == 'WAITING_ON_USER';

  factory SupportTicketSummary.fromJson(Map<String, dynamic> json) {
    final counts = json['_count'];

    return SupportTicketSummary(
      id: json['id'] as String,
      reference: (json['reference'] ?? '') as String,
      subject: (json['subject'] ?? '') as String,
      category: asEnum(json['category'], 'OTHER'),
      status: asEnum(json['status'], 'OPEN'),
      messageCount: counts is Map ? toInt(counts['messages']) : 0,
      createdAt: toDate(json['createdAt']),
      updatedAt: toDate(json['updatedAt']),
    );
  }
}

class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.body,
    required this.fromSupport,
    required this.authorFirstName,
    this.createdAt,
  });

  final String id;
  final String body;

  /// Whether support wrote it, rather than the customer. Internal staff notes
  /// never reach this client — they are filtered server-side.
  final bool fromSupport;

  final String authorFirstName;
  final DateTime? createdAt;

  factory SupportMessage.fromJson(Map<String, dynamic> json) => SupportMessage(
        id: json['id'] as String,
        body: (json['body'] ?? '') as String,
        fromSupport: json['fromSupport'] == true,
        authorFirstName: (json['authorFirstName'] ?? '') as String,
        createdAt: toDate(json['createdAt']),
      );
}

class SupportTicketDetail {
  const SupportTicketDetail({
    required this.id,
    required this.reference,
    required this.subject,
    required this.category,
    required this.status,
    required this.messages,
    this.createdAt,
    this.resolvedAt,
  });

  final String id;
  final String reference;
  final String subject;
  final String category;
  final String status;
  final List<SupportMessage> messages;
  final DateTime? createdAt;
  final DateTime? resolvedAt;

  bool get isClosed => status == 'CLOSED';

  factory SupportTicketDetail.fromJson(Map<String, dynamic> json) => SupportTicketDetail(
        id: json['id'] as String,
        reference: (json['reference'] ?? '') as String,
        subject: (json['subject'] ?? '') as String,
        category: asEnum(json['category'], 'OTHER'),
        status: asEnum(json['status'], 'OPEN'),
        messages: asList(json['messages']).map(SupportMessage.fromJson).toList(growable: false),
        createdAt: toDate(json['createdAt']),
        resolvedAt: toDate(json['resolvedAt']),
      );
}
