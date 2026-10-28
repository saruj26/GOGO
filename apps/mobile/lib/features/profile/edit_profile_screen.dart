import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/errors/api_exception.dart';
import '../../core/format/format.dart' as fmt;
import '../../core/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/forms.dart';
import '../../core/widgets/states.dart';

/// Edit the profile fields a person owns.
///
/// Phone is shown but not editable: it is the login identifier, and the backend
/// will not move an account to a number nobody has proved they control. Saying
/// that plainly is better than a field that silently fails.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _email = TextEditingController();

  String? _gender;
  bool _loaded = false;
  bool _busy = false;
  String? _error;
  final Map<String, String> _fieldErrors = {};

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _fieldErrors.clear();
      if (_firstName.text.trim().isEmpty) _fieldErrors['firstName'] = 'Enter your first name';
    });

    if (_fieldErrors.isNotEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(apiProvider).auth.updateProfile(
            firstName: _firstName.text.trim(),
            lastName: _lastName.text.trim(),
            email: _email.text.trim(),
            gender: _gender,
          );

      // Re-read rather than patching locally, so what is on screen is what the
      // server stored.
      await ref.read(authControllerProvider.notifier).refreshUser();

      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Profile updated')));
      context.pop();
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
    final user = ref.watch(currentUserProvider);
    final theme = Theme.of(context);

    if (user == null) return const Scaffold(body: LoadingState());

    if (!_loaded) {
      _firstName.text = user.firstName;
      _lastName.text = user.lastName ?? '';
      _email.text = user.email ?? '';
      _gender = user.gender;
      _loaded = true;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: ListView(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 12,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 32,
        ),
        children: [
          AppField(
            label: 'First name',
            controller: _firstName,
            enabled: !_busy,
            errorText: _fieldErrors['firstName'],
            textInputAction: TextInputAction.next,
          ),
          Gap.lg,
          AppField(
            label: 'Last name',
            controller: _lastName,
            enabled: !_busy,
            errorText: _fieldErrors['lastName'],
            textInputAction: TextInputAction.next,
          ),
          Gap.lg,
          AppField(
            label: 'Email',
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            enabled: !_busy,
            errorText: _fieldErrors['email'],
            helper: 'Changing this means it needs verifying again',
          ),
          Gap.lg,
          Text('Gender', style: theme.textTheme.labelLarge),
          Gap.xs,
          Text(
            'Used by shared-ride safety matching, so changing it changes who you can share a '
            'vehicle with.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
          ),
          Gap.sm,
          Wrap(
            spacing: 8,
            children: [
              for (final option in const [
                ('FEMALE', 'Female'),
                ('MALE', 'Male'),
                ('OTHER', 'Other'),
                ('UNDISCLOSED', 'Prefer not to say'),
              ])
                ChoiceChip(
                  label: Text(option.$2),
                  selected: _gender == option.$1,
                  onSelected: _busy ? null : (_) => setState(() => _gender = option.$1),
                ),
            ],
          ),
          Gap.xl,
          SectionCard(
            title: 'Phone number',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fmt.phone(user.phone), style: theme.textTheme.titleMedium),
                Gap.sm,
                const InfoNote(
                  icon: Icons.lock_outline,
                  message: 'Your phone number is how you sign in, so it cannot be changed here. '
                      'Contact support to change it.',
                ),
              ],
            ),
          ),
          if (_error != null) ...[Gap.lg, FormError(message: _error!)],
          Gap.xl,
          BusyButton(label: 'Save changes', busy: _busy, onPressed: _save),
        ],
      ),
    );
  }
}
