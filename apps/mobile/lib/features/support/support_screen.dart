import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';

/// Help and support.
///
/// A ticket is the route that leaves a record and can be followed up; phone and
/// email are there for the cases where somebody needs an answer now.
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Help & support')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text('Get in touch', style: theme.textTheme.titleMedium),
          Gap.md,
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.phone_outlined),
                  title: const Text('Call support'),
                  subtitle: Text(config.supportPhone),
                  trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                  onTap: () => launchUrl(
                    Uri.parse('tel:${config.supportPhone.replaceAll(' ', '')}'),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.mail_outline_rounded),
                  title: const Text('Email support'),
                  subtitle: Text(config.supportEmail),
                  trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                  onTap: () => launchUrl(Uri.parse('mailto:${config.supportEmail}')),
                ),
              ],
            ),
          ),
          Gap.lg,
          Card(
            child: ListTile(
              leading: const Icon(Icons.support_agent_outlined),
              title: const Text('Raise a support ticket'),
              subtitle: const Text('Best for anything that needs looking into'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/support/new'),
            ),
          ),
          Gap.sm,
          Card(
            child: ListTile(
              leading: const Icon(Icons.inbox_outlined),
              title: const Text('Your tickets'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => context.push('/support/tickets'),
            ),
          ),
          Gap.xl,
          Text('Common questions', style: theme.textTheme.titleMedium),
          Gap.md,
          const _Faq(
            question: 'How does a shared ride work?',
            answer: 'You are matched onto a journey a driver is already making, if their route '
                'genuinely passes your pick-up and destination in the right order. You pay less '
                'because the trip is shared. The matching is done on the real route, not just on '
                'how close two people happen to be.',
          ),
          const _Faq(
            question: 'Can I choose who I share with?',
            answer: 'Yes. Set a safety preference — any gender, same gender, women only or men '
                'only — before booking or in your account. It is applied when the ride is '
                'matched.',
          ),
          const _Faq(
            question: 'How do I pay?',
            answer: 'Rides are paid in cash to the driver. Food and parcel orders can be paid in '
                'cash or from your wallet. Card and online payment are not available yet.',
          ),
          const _Faq(
            question: 'Can I see where my driver is?',
            answer: 'Yes, once a driver has accepted and is on the way. Their position appears on '
                'the map on your ride screen while the trip is live, and stops when it ends.',
          ),
          const _Faq(
            question: 'Why is my shared ride waiting for the driver?',
            answer: 'A shared ride joins a journey someone is already making, so the driver '
                'confirms they can take you. Your seat is held while they decide, and you are '
                'told either way.',
          ),
        ],
      ),
    );
  }
}

class _Faq extends StatelessWidget {
  const _Faq({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ExpansionTile(
        title: Text(question, style: Theme.of(context).textTheme.titleSmall),
        shape: const Border(),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Align(alignment: Alignment.centerLeft, child: Text(answer)),
          ),
        ],
      ),
    );
  }
}
