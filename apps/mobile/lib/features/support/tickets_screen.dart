import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/format/labels.dart';
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../models/support.dart';
import 'support_providers.dart';

class TicketsScreen extends ConsumerWidget {
  const TicketsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tickets = ref.watch(myTicketsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your tickets')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/support/new'),
        icon: const Icon(Icons.add),
        label: const Text('New ticket'),
      ),
      body: tickets.when(
        loading: () => const LoadingState(),
        error: (error, _) =>
            ErrorState(error: error, onRetry: () => ref.invalidate(myTicketsProvider)),
        data: (page) => page.items.isEmpty
            ? const EmptyState(
                title: 'No tickets yet',
                message: 'If something goes wrong with a ride, an order or a payment, raise a '
                    'ticket and we will look into it.',
                icon: Icons.support_agent_outlined,
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(myTicketsProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  itemCount: page.items.length,
                  separatorBuilder: (_, _) => Gap.sm,
                  itemBuilder: (context, index) {
                    final ticket = page.items[index];

                    return Card(
                      child: ListTile(
                        onTap: () => context.push('/support/tickets/${ticket.id}'),
                        title: Text(
                          ticket.subject,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              StatusBadge(
                                status: ticket.status,
                                labels: supportStatusLabel,
                                dense: true,
                              ),
                              Text(
                                '${ticket.reference} · ${fmt.relativeTime(ticket.updatedAt ?? ticket.createdAt)}',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: Theme.of(context).colorScheme.outline),
                              ),
                            ],
                          ),
                        ),
                        trailing: ticket.needsYou
                            ? const Icon(Icons.priority_high_rounded, color: AppColors.warning)
                            : const Icon(Icons.chevron_right_rounded),
                        isThreeLine: true,
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}

class NewTicketScreen extends ConsumerStatefulWidget {
  const NewTicketScreen({super.key});

  @override
  ConsumerState<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends ConsumerState<NewTicketScreen> {
  final _subject = TextEditingController();
  final _description = TextEditingController();

  String _category = 'RIDE';
  bool _busy = false;
  String? _error;
  final Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _fieldErrors.clear();
      if (_subject.text.trim().length < 4) {
        _fieldErrors['subject'] = 'Give it a short title';
      }
      if (_description.text.trim().length < 10) {
        _fieldErrors['description'] = 'Tell us a little more so we can help';
      }
    });

    if (_fieldErrors.isNotEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final ticket = await ref.read(apiProvider).support.create(
            subject: _subject.text.trim(),
            category: _category,
            description: _description.text.trim(),
          );

      ref.invalidate(myTicketsProvider);
      if (!mounted) return;
      context.pushReplacement('/support/tickets/${ticket.id}');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = error.message;
        _fieldErrors.addAll(error.fieldErrors);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New ticket')),
      body: ListView(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 12,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 32,
        ),
        children: [
          Text('What is it about?', style: Theme.of(context).textTheme.labelLarge),
          Gap.sm,
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in supportCategories.entries)
                ChoiceChip(
                  label: Text(entry.value),
                  selected: _category == entry.key,
                  onSelected: _busy ? null : (_) => setState(() => _category = entry.key),
                ),
            ],
          ),
          Gap.xl,
          AppField(
            label: 'Title',
            controller: _subject,
            hint: 'e.g. Driver did not arrive',
            maxLength: 160,
            enabled: !_busy,
            errorText: _fieldErrors['subject'],
          ),
          Gap.lg,
          AppField(
            label: 'What happened?',
            controller: _description,
            hint: 'Tell us what went wrong, and when',
            maxLines: 6,
            maxLength: 4000,
            enabled: !_busy,
            errorText: _fieldErrors['description'],
          ),
          if (_error != null) ...[Gap.lg, FormError(message: _error!)],
          Gap.xl,
          BusyButton(label: 'Send to support', busy: _busy, onPressed: _submit),
        ],
      ),
    );
  }
}

class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _reply = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _reply.text.trim();
    if (body.isEmpty) return;

    setState(() => _sending = true);

    try {
      await ref.read(apiProvider).support.reply(widget.ticketId, body);
      _reply.clear();
      ref.invalidate(ticketProvider(widget.ticketId));
      ref.invalidate(myTicketsProvider);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ticket = ref.watch(ticketProvider(widget.ticketId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(ticket.value?.reference ?? 'Ticket')),
      body: ticket.when(
        loading: () => const LoadingState(),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(ticketProvider(widget.ticketId)),
        ),
        data: (detail) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                children: [
                  Row(
                    children: [
                      StatusBadge(status: detail.status, labels: supportStatusLabel),
                      const Spacer(),
                      Text(
                        labelFor(supportCategories, detail.category),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    ],
                  ),
                  Gap.md,
                  Text(detail.subject, style: theme.textTheme.titleMedium),
                  Gap.lg,
                  for (final message in detail.messages) ...[
                    _Bubble(message: message),
                    Gap.sm,
                  ],
                  if (detail.isClosed) ...[
                    Gap.lg,
                    const InfoNote(
                      message: 'This ticket is closed. Raise a new one if you still need help.',
                    ),
                  ],
                ],
              ),
            ),
            if (!detail.isClosed)
              SafeArea(
                child: Padding(
                  padding: EdgeInsets.only(
                    left: 12,
                    right: 12,
                    bottom: MediaQuery.viewInsetsOf(context).bottom + 8,
                    top: 8,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _reply,
                          enabled: !_sending,
                          minLines: 1,
                          maxLines: 4,
                          decoration: const InputDecoration(hintText: 'Write a reply'),
                        ),
                      ),
                      Gap.sm,
                      IconButton.filled(
                        onPressed: _sending ? null : _send,
                        icon: _sending
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final SupportMessage message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fromSupport = message.fromSupport;

    return Align(
      alignment: fromSupport ? Alignment.centerLeft : Alignment.centerRight,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: fromSupport
                ? theme.colorScheme.surfaceContainerHighest
                : theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fromSupport ? 'Support' : 'You',
                style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.outline),
              ),
              Gap.xs,
              Text(message.body),
              Gap.xs,
              Text(
                fmt.relativeTime(message.createdAt),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
