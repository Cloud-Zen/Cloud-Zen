import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://cloud-zen-backend.onrender.com',
);

void main() {
  runApp(const CloudZenMaster());
}

class CloudZenMaster extends StatelessWidget {
  const CloudZenMaster({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Cloud-Zen Master',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor:
            const Color(0xFF070A12),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFBFA2FF),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const LoginPage(),
    );
  }
}

class Api {
  String? token;

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        if (token != null)
          'Authorization': 'Bearer $token',
      };

  Future<dynamic> get(String path) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl$path'),
      headers: headers,
    );

    return _handle(response);
  }

  Future<dynamic> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl$path'),
      headers: headers,
      body: jsonEncode(body),
    );

    return _handle(response);
  }

  dynamic _handle(http.Response response) {
    dynamic data;

    try {
      data = jsonDecode(response.body);
    } catch (_) {
      data = {
        'error': response.body,
      };
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300) {
      throw Exception(
        data['error'] ??
            'Server error ${response.statusCode}',
      );
    }

    return data;
  }
}

final api = Api();

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() =>
      _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();

  bool register = false;
  bool busy = false;
  String error = '';

  Future<void> submit() async {
    FocusScope.of(context).unfocus();

    setState(() {
      busy = true;
      error = '';
    });

    try {
      final result = await api.post(
        register
            ? '/api/auth/register'
            : '/api/auth/login',
        {
          'email': email.text.trim(),
          'password': password.text,
        },
      );

      api.token = result['token'];

      if (!mounted) return;

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => const Dashboard(),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e
              .toString()
              .replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(maxWidth: 460),
            child: Column(
              children: [
                const Icon(
                  Icons.cloud_done_rounded,
                  size: 76,
                  color: Color(0xFFD7C4FF),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Cloud-Zen',
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  register
                      ? 'Create Master Account'
                      : 'Master Controller',
                  style: const TextStyle(
                    color: Colors.white60,
                  ),
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: email,
                  keyboardType:
                      TextInputType.emailAddress,
                  decoration:
                      const InputDecoration(
                    labelText: 'Email',
                    prefixIcon:
                        Icon(Icons.email_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration:
                      const InputDecoration(
                    labelText: 'Password',
                    prefixIcon:
                        Icon(Icons.lock_outline),
                  ),
                ),
                const SizedBox(height: 16),
                if (error.isNotEmpty)
                  Text(
                    error,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.redAccent,
                    ),
                  ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: FilledButton(
                    onPressed:
                        busy ? null : submit,
                    child: busy
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child:
                                CircularProgressIndicator(),
                          )
                        : Text(
                            register
                                ? 'Create Account'
                                : 'Login',
                          ),
                  ),
                ),
                TextButton(
                  onPressed: busy
                      ? null
                      : () {
                          setState(() {
                            register = !register;
                            error = '';
                          });
                        },
                  child: Text(
                    register
                        ? 'Already have an account? Login'
                        : 'Create a new account',
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  apiBaseUrl,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Colors.white30,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class Dashboard extends StatefulWidget {
  const Dashboard({super.key});

  @override
  State<Dashboard> createState() =>
      _DashboardState();
}

class _DashboardState
    extends State<Dashboard> {
  List devices = [];
  List files = [];

  Map storage = {};

  bool loading = true;

  String? sessionId;
  String? qrPayload;

  Timer? pollTimer;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  @override
  void dispose() {
    pollTimer?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    try {
      final d =
          await api.get('/api/devices');

      final f =
          await api.get('/api/files');

      final s =
          await api.get('/api/storage');

      if (!mounted) return;

      setState(() {
        devices = List.from(d);
        files = List.from(f);
        storage = Map.from(s);
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          loading = false;
        });

        snack(
          e.toString()
              .replaceFirst('Exception: ', ''),
        );
      }
    }
  }

  Future<void> createQr() async {
    try {
      final result =
          await api.post(
        '/api/pairing/create',
        {},
      );

      pollTimer?.cancel();

      setState(() {
        sessionId = result['sessionId'];
        qrPayload = result['qrPayload'];
      });

      pollTimer = Timer.periodic(
        const Duration(seconds: 2),
        (_) => checkPairing(),
      );
    } catch (e) {
      snack(
        e.toString()
            .replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> checkPairing() async {
    if (sessionId == null) return;

    try {
      final result =
          await api.get(
        '/api/pairing/$sessionId',
      );

      if (result['status'] == 'approved') {
        pollTimer?.cancel();

        if (!mounted) return;

        setState(() {
          sessionId = null;
          qrPayload = null;
        });

        await refresh();

        snack(
          'Client device paired successfully.',
        );
      }
    } catch (_) {}
  }

  Future<void> setPermission(
    String id,
    bool enabled,
  ) async {
    try {
      await api.post(
        '/api/devices/$id/backup-permission',
        {'enabled': enabled},
      );

      await refresh();
    } catch (e) {
      snack(
        e.toString()
            .replaceFirst('Exception: ', ''),
      );
    }
  }

  void snack(String text) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(content: Text(text)),
    );
  }

  String formatBytes(dynamic value) {
    final bytes =
        int.tryParse('$value') ?? 0;

    if (bytes < 1024) {
      return '$bytes B';
    }

    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }

    if (bytes <
        1024 * 1024 * 1024) {
      return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    }

    return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title:
            const Text('Cloud-Zen Master'),
        actions: [
          IconButton(
            onPressed: refresh,
            icon:
                const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(
              child:
                  CircularProgressIndicator(),
            )
          : RefreshIndicator(
              onRefresh: refresh,
              child: ListView(
                padding:
                    const EdgeInsets.all(18),
                children: [
                  Card(
                    child: Padding(
                      padding:
                          const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: const [
                          Text(
                            'Private Cloud Controller',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight:
                                  FontWeight.bold,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Pair devices only with explicit consent and enable backup permission when you want backups to run.',
                            style: TextStyle(
                              color:
                                  Colors.white60,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: stat(
                          'Devices',
                          '${devices.length}',
                          Icons.devices,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: stat(
                          'Files',
                          '${storage['fileCount'] ?? 0}',
                          Icons.folder,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: stat(
                          'Used',
                          formatBytes(
                            storage[
                                'usedBytes'],
                          ),
                          Icons.storage,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Connected Devices',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (devices.isEmpty)
                    const Card(
                      child: Padding(
                        padding:
                            EdgeInsets.all(20),
                        child: Text(
                          'No devices paired yet.',
                        ),
                      ),
                    ),
                  ...devices.map(
                    (device) => Card(
                      child: ListTile(
                        leading:
                            const CircleAvatar(
                          child: Icon(
                            Icons
                                .phone_android,
                          ),
                        ),
                        title: Text(
                          device['name'] ??
                              'Android',
                        ),
                        subtitle: Text(
                          device['revoked'] ==
                                  true
                              ? 'Revoked'
                              : device[
                                          'backup_enabled'] ==
                                      true
                                  ? 'Backup enabled'
                                  : 'Backup disabled',
                        ),
                        trailing:
                            Switch(
                          value:
                              device['backup_enabled'] ==
                                      true &&
                                  device['revoked'] !=
                                      true,
                          onChanged:
                              device['revoked'] ==
                                      true
                                  ? null
                                  : (value) =>
                                      setPermission(
                                        device['id'],
                                        value,
                                      ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: createQr,
                      icon: const Icon(
                        Icons.qr_code_2,
                      ),
                      label: const Text(
                        'Generate Pairing QR',
                      ),
                    ),
                  ),
                  if (qrPayload != null)
                    Padding(
                      padding:
                          const EdgeInsets.only(
                        top: 18,
                      ),
                      child: Card(
                        child: Padding(
                          padding:
                              const EdgeInsets.all(
                            20,
                          ),
                          child: Column(
                            children: [
                              const Text(
                                'Scan this QR from Client',
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight:
                                      FontWeight
                                          .bold,
                                ),
                              ),
                              const SizedBox(
                                  height: 18),
                              Container(
                                padding:
                                    const EdgeInsets
                                        .all(14),
                                color:
                                    Colors.white,
                                child:
                                    QrImageView(
                                  data:
                                      qrPayload!,
                                  size: 230,
                                ),
                              ),
                              const SizedBox(
                                  height: 12),
                              const Text(
                                'Waiting for Client…',
                                style:
                                    TextStyle(
                                  color:
                                      Colors.white54,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  const Text(
                    'Cloud Files',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  ...files.map(
                    (file) => ListTile(
                      leading: const Icon(
                        Icons
                            .insert_drive_file,
                      ),
                      title: Text(
                        file['name'] ?? '',
                      ),
                      subtitle: Text(
                        '${formatBytes(file['size'])} • ${file['status']}',
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget stat(
    String title,
    String value,
    IconData icon,
  ) {
    return Card(
      child: Padding(
        padding:
            const EdgeInsets.all(14),
        child: Column(
          children: [
            Icon(
              icon,
              color:
                  const Color(0xFFD7C4FF),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight:
                    FontWeight.bold,
              ),
            ),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                color:
                    Colors.white54,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
