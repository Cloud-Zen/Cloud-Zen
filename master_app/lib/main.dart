import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

const String apiBaseUrl = 'https://YOUR-RENDER-SERVICE.onrender.com';

void main() {
  runApp(const CloudZenMasterApp());
}

class CloudZenMasterApp extends StatelessWidget {
  const CloudZenMasterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cloud-Zen Master',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF07080D),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFB9C9FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        fontFamily: 'sans',
      ),
      home: const LoginPage(),
    );
  }
}

class ApiClient {
  String? token;

  Uri _uri(String path) {
    final base = apiBaseUrl.replaceFirst(RegExp(r'/$'), '');
    return Uri.parse('$base$path');
  }

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    final response = await http.post(
      _uri('/api/auth/login'),
      headers: headers,
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Login failed');
    }

    token = data['token']?.toString();

    if (token == null || token!.isEmpty) {
      throw Exception('Server did not return a login token');
    }

    return data;
  }

  Future<Map<String, dynamic>> createPairingSession() async {
    final response = await http.post(
      _uri('/api/pairing/session'),
      headers: headers,
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not create pairing session');
    }

    return data;
  }

  Future<Map<String, dynamic>> getPairingSession(String id) async {
    final response = await http.get(
      _uri('/api/pairing/session/$id'),
      headers: headers,
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not check pairing session');
    }

    return data;
  }

  Future<List<dynamic>> getDevices() async {
    final response = await http.get(
      _uri('/api/devices'),
      headers: headers,
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not load devices');
    }

    return List<dynamic>.from(data['devices'] ?? []);
  }

  Future<void> setBackupPermission(
    String deviceId,
    bool enabled,
  ) async {
    final response = await http.patch(
      _uri('/api/devices/$deviceId/backup'),
      headers: headers,
      body: jsonEncode({
        'enabled': enabled,
      }),
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not update backup permission');
    }
  }

  Future<Map<String, dynamic>> createBackupJob(
    String deviceId,
  ) async {
    final response = await http.post(
      _uri('/api/backups/jobs'),
      headers: headers,
      body: jsonEncode({
        'device_id': deviceId,
      }),
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not create backup job');
    }

    return data;
  }

  Future<List<dynamic>> getBackups() async {
    final response = await http.get(
      _uri('/api/backups'),
      headers: headers,
    );

    final data = _decode(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Could not load backup jobs');
    }

    return List<dynamic>.from(data['jobs'] ?? []);
  }

  Map<String, dynamic> _decode(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);

      if (decoded is Map<String, dynamic>) {
        return decoded;
      }

      return {
        'data': decoded,
      };
    } catch (_) {
      return {
        'error': response.body.isEmpty
            ? 'Empty server response'
            : response.body,
      };
    }
  }
}

final ApiClient api = ApiClient();

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final emailController =
      TextEditingController(text: 'demo@example.com');

  final passwordController =
      TextEditingController(text: 'ChangeMe123!');

  bool loading = false;
  bool obscurePassword = true;
  String? error;

  Future<void> login() async {
    FocusScope.of(context).unfocus();

    setState(() {
      loading = true;
      error = null;
    });

    try {
      await api.login(
        emailController.text.trim(),
        passwordController.text,
      );

      if (!mounted) return;

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => const DashboardPage(),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = cleanError(e);
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  const CloudZenLogo(),
                  const SizedBox(height: 28),
                  Text(
                    'Master Console',
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .headlineMedium
                        ?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Manage paired devices and authorized backups.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white.withOpacity(.62),
                    ),
                  ),
                  const SizedBox(height: 30),
                  GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: passwordController,
                          obscureText: obscurePassword,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon:
                                const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              onPressed: () {
                                setState(() {
                                  obscurePassword =
                                      !obscurePassword;
                                });
                              },
                              icon: Icon(
                                obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                        ),
                        if (error != null) ...[
                          const SizedBox(height: 14),
                          ErrorBox(message: error!),
                        ],
                        const SizedBox(height: 22),
                        FilledButton.icon(
                          onPressed: loading ? null : login,
                          icon: loading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.login),
                          label: Text(
                            loading
                                ? 'Signing in...'
                                : 'Sign in',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Demo account is pre-filled for initial testing.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white.withOpacity(.42),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  List<dynamic> devices = [];
  List<dynamic> jobs = [];

  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    loadDashboard();
  }

  Future<void> loadDashboard() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final results = await Future.wait([
        api.getDevices(),
        api.getBackups(),
      ]);

      if (!mounted) return;

      setState(() {
        devices = results[0];
        jobs = results[1];
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = cleanError(e);
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  Future<void> openPairing() async {
    try {
      final data = await api.createPairingSession();

      if (!mounted) return;

      final sessionId = data['session_id']?.toString();
      final qrPayload = data['qr_payload']?.toString();

      if (sessionId == null || qrPayload == null) {
        throw Exception(
          'Server returned an invalid pairing session.',
        );
      }

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PairingPage(
            sessionId: sessionId,
            qrPayload: qrPayload,
          ),
        ),
      );

      await loadDashboard();
    } catch (e) {
      if (!mounted) return;
      showMessage(cleanError(e));
    }
  }

  Future<void> toggleBackup(
    Map<String, dynamic> device,
    bool value,
  ) async {
    final id = device['id']?.toString();

    if (id == null) {
      showMessage('Device ID is missing.');
      return;
    }

    try {
      await api.setBackupPermission(id, value);
      await loadDashboard();
    } catch (e) {
      if (!mounted) return;
      showMessage(cleanError(e));
    }
  }

  Future<void> queueBackup(
    Map<String, dynamic> device,
  ) async {
    final id = device['id']?.toString();

    if (id == null) {
      showMessage('Device ID is missing.');
      return;
    }

    final enabled =
        device['backup_enabled'] == true;

    if (!enabled) {
      showMessage(
        'Enable backup permission for this device first.',
      );
      return;
    }

    try {
      await api.createBackupJob(id);
      await loadDashboard();

      if (!mounted) return;
      showMessage('Backup job queued.');
    } catch (e) {
      if (!mounted) return;
      showMessage(cleanError(e));
    }
  }

  void showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> logout() async {
    api.token = null;

    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const LoginPage(),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final enabledCount = devices.where(
      (d) => d['backup_enabled'] == true,
    ).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Cloud-Zen',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: loading ? null : loadDashboard,
            icon: const Icon(Icons.refresh),
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'logout') {
                logout();
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'logout',
                child: Text('Sign out'),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: openPairing,
        icon: const Icon(Icons.qr_code_2),
        label: const Text('Pair device'),
      ),
      body: RefreshIndicator(
        onRefresh: loadDashboard,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            16,
            12,
            16,
            110,
          ),
          children: [
            const HeroPanel(),
            const SizedBox(height: 18),
            if (error != null) ...[
              ErrorBox(message: error!),
              const SizedBox(height: 16),
            ],
            Row(
              children: [
                Expanded(
                  child: StatCard(
                    title: 'Devices',
                    value: devices.length.toString(),
                    icon: Icons.devices_other,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: StatCard(
                    title: 'Backup Ready',
                    value: enabledCount.toString(),
                    icon: Icons.cloud_done_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            SectionHeader(
              title: 'Paired Devices',
              action: '${devices.length} total',
            ),
            const SizedBox(height: 10),
            if (loading && devices.isEmpty)
              const LoadingCard()
            else if (devices.isEmpty)
              const EmptyCard(
                icon: Icons.devices_other_outlined,
                title: 'No paired devices',
                subtitle:
                    'Tap “Pair device” to generate a QR code.',
              )
            else
              ...devices.map(
                (raw) => DeviceCard(
                  device:
                      Map<String, dynamic>.from(raw as Map),
                  onBackupChanged: toggleBackup,
                  onQueueBackup: queueBackup,
                ),
              ),
            const SizedBox(height: 24),
            SectionHeader(
              title: 'Backup Jobs',
              action: '${jobs.length} jobs',
            ),
            const SizedBox(height: 10),
            if (jobs.isEmpty)
              const EmptyCard(
                icon: Icons.backup_outlined,
                title: 'No backup jobs',
                subtitle:
                    'Authorized backup jobs will appear here.',
              )
            else
              ...jobs.map(
                (raw) => BackupJobCard(
                  job:
                      Map<String, dynamic>.from(raw as Map),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class PairingPage extends StatefulWidget {
  final String sessionId;
  final String qrPayload;

  const PairingPage({
    super.key,
    required this.sessionId,
    required this.qrPayload,
  });

  @override
  State<PairingPage> createState() => _PairingPageState();
}

class _PairingPageState extends State<PairingPage> {
  Timer? timer;
  String status = 'Waiting for the Client device...';
  bool paired = false;

  @override
  void initState() {
    super.initState();

    timer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => checkPairing(),
    );

    checkPairing();
  }

  Future<void> checkPairing() async {
    try {
      final data =
          await api.getPairingSession(widget.sessionId);

      final state = data['status']?.toString() ?? 'pending';

      if (!mounted) return;

      setState(() {
        if (state == 'approved') {
          paired = true;
          status = 'Device paired successfully.';
        } else if (state == 'expired') {
          status = 'This QR code has expired.';
        } else if (state == 'rejected') {
          status = 'Pairing was rejected.';
        } else {
          status = 'Waiting for the Client device...';
        }
      });

      if (state == 'approved' ||
          state == 'expired' ||
          state == 'rejected') {
        timer?.cancel();
      }
    } catch (_) {
      // Keep polling while the temporary pairing screen is open.
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pair a Device'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            GlassCard(
              child: Column(
                children: [
                  const Icon(
                    Icons.qr_code_2,
                    size: 34,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Scan this QR from the Cloud-Zen Client app',
                    textAlign: TextAlign.center,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: QrImageView(
                      data: widget.qrPayload,
                      size: 260,
                      backgroundColor: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment:
                        MainAxisAlignment.center,
                    children: [
                      Icon(
                        paired
                            ? Icons.check_circle
                            : Icons.sync,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          status,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'Pairing requires explicit consent on the Client device.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white54,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DeviceCard extends StatelessWidget {
  final Map<String, dynamic> device;
  final Future<void> Function(
    Map<String, dynamic>,
    bool,
  ) onBackupChanged;
  final Future<void> Function(
    Map<String, dynamic>,
  ) onQueueBackup;

  const DeviceCard({
    super.key,
    required this.device,
    required this.onBackupChanged,
    required this.onQueueBackup,
  });

  @override
  Widget build(BuildContext context) {
    final name =
        device['device_name']?.toString() ??
            device['name']?.toString() ??
            'Unknown device';

    final platform =
        device['platform']?.toString() ?? 'Unknown platform';

    final model =
        device['model']?.toString() ?? 'Unknown model';

    final enabled = device['backup_enabled'] == true;

    return GlassCard(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
                  color: Colors.white.withOpacity(.08),
                ),
                child: const Icon(
                  Icons.smartphone_outlined,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$platform • $model',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                enabled
                    ? Icons.cloud_done
                    : Icons.cloud_off,
                size: 20,
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 6),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Backup permission',
              style: TextStyle(
                fontWeight: FontWeight.w700,
              ),
            ),
            subtitle: Text(
              enabled
                  ? 'Authorized'
                  : 'Not authorized',
            ),
            value: enabled,
            onChanged: (value) {
              onBackupChanged(device, value);
            },
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: enabled
                  ? () => onQueueBackup(device)
                  : null,
              icon: const Icon(
                Icons.backup_outlined,
              ),
              label: const Text('Queue backup'),
            ),
          ),
        ],
      ),
    );
  }
}

class BackupJobCard extends StatelessWidget {
  final Map<String, dynamic> job;

  const BackupJobCard({
    super.key,
    required this.job,
  });

  @override
  Widget build(BuildContext context) {
    final status =
        job['status']?.toString() ?? 'unknown';

    final id =
        job['id']?.toString() ?? '—';

    final deviceId =
        job['device_id']?.toString() ?? '—';

    return GlassCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          StatusIcon(status: status),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  status.toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Job: ${shortId(id)}',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Device: ${shortId(deviceId)}',
                  style: const TextStyle(
                    color: Colors.white38,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StatusIcon extends StatelessWidget {
  final String status;

  const StatusIcon({
    super.key,
    required this.status,
  });

  @override
  Widget build(BuildContext context) {
    IconData icon;

    switch (status.toLowerCase()) {
      case 'completed':
        icon = Icons.check_circle_outline;
        break;
      case 'failed':
        icon = Icons.error_outline;
        break;
      case 'running':
        icon = Icons.sync;
        break;
      default:
        icon = Icons.schedule_outlined;
    }

    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Colors.white.withOpacity(.07),
      ),
      child: Icon(icon),
    );
  }
}

class HeroPanel extends StatelessWidget {
  const HeroPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CloudZenLogo(size: 46),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  'Your Personal Cloud Control Center',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'Pair authorized devices, manage backup permission, and monitor backup jobs from one place.',
            style: TextStyle(
              height: 1.45,
              color: Colors.white.withOpacity(.62),
            ),
          ),
        ],
      ),
    );
  }
}

class CloudZenLogo extends StatelessWidget {
  final double size;

  const CloudZenLogo({
    super.key,
    this.size = 72,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(
          size * .28,
        ),
        gradient: const LinearGradient(
          colors: [
            Color(0xFFB9C9FF),
            Color(0xFFF3B4CF),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFB9C9FF)
                .withOpacity(.18),
            blurRadius: 28,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Icon(
        Icons.cloud_outlined,
        color: const Color(0xFF07080D),
        size: size * .52,
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;

  const StatCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22),
          const SizedBox(height: 14),
          Text(
            value,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final String action;

  const SectionHeader({
    super.key,
    required this.title,
    required this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        Text(
          action,
          style: const TextStyle(
            color: Colors.white38,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? margin;

  const GlassCard({
    super.key,
    required this.child,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(.045),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: Colors.white.withOpacity(.09),
        ),
      ),
      child: child,
    );
  }
}

class EmptyCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const EmptyCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        children: [
          Icon(
            icon,
            size: 38,
            color: Colors.white38,
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white45,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class LoadingCard extends StatelessWidget {
  const LoadingCard({super.key});

  @override
  Widget build(BuildContext context) {
    return const GlassCard(
      child: Padding(
        padding: EdgeInsets.all(18),
        child: Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}

class ErrorBox extends StatelessWidget {
  final String message;

  const ErrorBox({
    super.key,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.red.withOpacity(.10),
        border: Border.all(
          color: Colors.red.withOpacity(.25),
        ),
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String cleanError(Object error) {
  final text = error.toString();

  if (text.startsWith('Exception: ')) {
    return text.substring(11);
  }

  return text;
}

String shortId(String value) {
  if (value.length <= 12) return value;
  return '${value.substring(0, 8)}...';
}
