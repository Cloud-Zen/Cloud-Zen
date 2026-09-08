import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue:
      'https://cloud-zen-backend.onrender.com',
);

void main() => runApp(
      const CloudZenMaster(),
    );

class CloudZenMaster extends StatelessWidget {
  const CloudZenMaster({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Cloud-Zen Master',
      theme: ThemeData.dark(useMaterial3: true)
          .copyWith(
        colorScheme:
            ColorScheme.fromSeed(
          seedColor:
              const Color(0xffb9c9ff),
          brightness:
              Brightness.dark,
        ),
        scaffoldBackgroundColor:
            const Color(0xff07080d),
      ),
      home: const LoginPage(),
    );
  }
}

String errorText(http.Response r) {
  try {
    return jsonDecode(r.body)['error']
            ?.toString() ??
        'Request failed (${r.statusCode})';
  } catch (_) {
    return 'Request failed (${r.statusCode})';
  }
}

String formatBytes(dynamic value) {
  final n =
      int.tryParse('$value') ?? 0;

  if (n < 1024) {
    return '$n B';
  }

  if (n < 1024 * 1024) {
    return '${(n / 1024).toStringAsFixed(1)} KB';
  }

  if (n <
      1024 * 1024 * 1024) {
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  return '${(n / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() =>
      _LoginPageState();
}

class _LoginPageState
    extends State<LoginPage> {
  final email =
      TextEditingController();

  final password =
      TextEditingController();

  bool loading = false;
  bool registerMode = false;

  Future<void> submit() async {
    final emailValue =
        email.text.trim();

    final passwordValue =
        password.text;

    if (emailValue.isEmpty ||
        passwordValue.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'Enter email and password.',
          ),
        ),
      );
      return;
    }

    setState(() {
      loading = true;
    });

    try {
      final endpoint =
          registerMode
              ? '/api/auth/register'
              : '/api/auth/login';

      final r = await http.post(
        Uri.parse(
          '$apiBaseUrl$endpoint',
        ),
        headers: {
          'Content-Type':
              'application/json',
        },
        body: jsonEncode({
          'email': emailValue,
          'password': passwordValue,
        }),
      );

      if (!mounted) return;

      final success =
          (registerMode &&
                  r.statusCode == 201) ||
              (!registerMode &&
                  r.statusCode == 200);

      if (success) {
        final data =
            jsonDecode(r.body);

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => Dashboard(
              token: data['token'],
            ),
          ),
        );
      } else {
        ScaffoldMessenger.of(context)
            .showSnackBar(
          SnackBar(
            content:
                Text(errorText(r)),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(
          SnackBar(
            content: Text(
              'Backend connection failed: $e',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding:
              const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(
              maxWidth: 520,
            ),
            child: Card(
              child: Padding(
                padding:
                    const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize:
                      MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons
                          .cloud_done_rounded,
                      size: 78,
                    ),

                    const SizedBox(
                      height: 12,
                    ),

                    const Text(
                      'Cloud-Zen',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight:
                            FontWeight.w800,
                      ),
                    ),

                    const SizedBox(
                      height: 6,
                    ),

                    Text(
                      registerMode
                          ? 'Create your owner account'
                          : 'Master backup dashboard',
                    ),

                    const SizedBox(
                      height: 24,
                    ),

                    TextField(
                      controller: email,
                      keyboardType:
                          TextInputType
                              .emailAddress,
                      decoration:
                          const InputDecoration(
                        labelText: 'Email',
                        prefixIcon:
                            Icon(
                          Icons
                              .email_outlined,
                        ),
                      ),
                    ),

                    const SizedBox(
                      height: 12,
                    ),

                    TextField(
                      controller: password,
                      obscureText: true,
                      decoration:
                          const InputDecoration(
                        labelText:
                            'Password',
                        prefixIcon:
                            Icon(
                          Icons
                              .lock_outline,
                        ),
                      ),
                    ),

                    const SizedBox(
                      height: 20,
                    ),

                    SizedBox(
                      width:
                          double.infinity,
                      child:
                          FilledButton.icon(
                        onPressed:
                            loading
                                ? null
                                : submit,
                        icon: Icon(
                          registerMode
                              ? Icons
                                  .person_add
                              : Icons.login,
                        ),
                        label: Text(
                          loading
                              ? 'Please wait…'
                              : registerMode
                                  ? 'Create account'
                                  : 'Sign in',
                        ),
                      ),
                    ),

                    TextButton(
                      onPressed:
                          loading
                              ? null
                              : () {
                                  setState(
                                    () {
                                      registerMode =
                                          !registerMode;
                                    },
                                  );
                                },
                      child: Text(
                        registerMode
                            ? 'Already have an account? Sign in'
                            : 'Create a new account',
                      ),
                    ),

                    const SizedBox(
                      height: 8,
                    ),

                    const Text(
                      'Backend: cloud-zen-backend.onrender.com',
                      style: TextStyle(
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class Dashboard extends StatefulWidget {
  final String token;

  const Dashboard({
    super.key,
    required this.token,
  });

  @override
  State<Dashboard> createState() =>
      _DashboardState();
}

class _DashboardState
    extends State<Dashboard> {
  List devices = [];
  List files = [];
  List backups = [];

  bool loading = true;
  bool deletionLocked = false;

  Map<String, String>
      get headers => {
            'Authorization':
                'Bearer ${widget.token}',
            'Content-Type':
                'application/json',
          };

  Future<void> load() async {
    try {
      final results =
          await Future.wait([
        http.get(
          Uri.parse(
            '$apiBaseUrl/api/devices',
          ),
          headers: headers,
        ),
        http.get(
          Uri.parse(
            '$apiBaseUrl/api/files',
          ),
          headers: headers,
        ),
        http.get(
          Uri.parse(
            '$apiBaseUrl/api/backups',
          ),
          headers: headers,
        ),
        http.get(
          Uri.parse(
            '$apiBaseUrl/api/deletion/status',
          ),
          headers: headers,
        ),
      ]);

      if (!mounted) return;

      setState(() {
        if (results[0].statusCode ==
            200) {
          devices =
              jsonDecode(
                    results[0].body,
                  )['devices'] ??
                  [];
        }

        if (results[1].statusCode ==
            200) {
          files =
              jsonDecode(
                    results[1].body,
                  )['files'] ??
                  [];
        }

        if (results[2].statusCode ==
            200) {
          backups =
              jsonDecode(
                    results[2].body,
                  )['backups'] ??
                  [];
        }

        if (results[3].statusCode ==
            200) {
          deletionLocked =
              jsonDecode(
                    results[3].body,
                  )['locked'] ==
                  true;
        }

        loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  Future<void> addDevice() async {
    try {
      final r = await http.post(
        Uri.parse(
          '$apiBaseUrl/api/pairing/session',
        ),
        headers: headers,
      );

      if (r.statusCode != 200) {
        throw Exception(
          errorText(r),
        );
      }

      final data =
          jsonDecode(r.body);

      if (!mounted) return;

      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PairingPage(
            token: widget.token,
            sessionId:
                data['sessionId'],
            qrPayload:
                data['qrPayload'],
          ),
        ),
      );

      load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(
          SnackBar(
            content: Text('$e'),
          ),
        );
      }
    }
  }

  Future<void> setBackup(
    String id,
    bool enabled,
  ) async {
    final r = await http.patch(
      Uri.parse(
        '$apiBaseUrl/api/devices/$id/backup',
      ),
      headers: headers,
      body: jsonEncode({
        'enabled': enabled,
      }),
    );

    if (!mounted) return;

    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(
        content: Text(
          r.statusCode == 200
              ? enabled
                  ? 'Backup permission enabled.'
                  : 'Backup permission disabled.'
              : errorText(r),
        ),
      ),
    );

    load();
  }

  Future<void> deleteFile(
    Map f,
  ) async {
    if (deletionLocked) return;

    final credentials =
        await showDeletionDialog(
      context,
      'Delete cloud backup?',
      'Only the Cloud-Zen cloud copy will be deleted. The original phone file is untouched.',
    );

    if (credentials == null) {
      return;
    }

    final r = await http.delete(
      Uri.parse(
        '$apiBaseUrl/api/files/${f['id']}',
      ),
      headers: headers,
      body: jsonEncode(
        credentials,
      ),
    );

    if (!mounted) return;

    if (r.statusCode == 200) {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'Cloud copy deleted. Local file untouched.',
          ),
        ),
      );
    } else if (r.statusCode == 423) {
      setState(() {
        deletionLocked = true;
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'Deletion controls are temporarily locked.',
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content:
              Text(errorText(r)),
        ),
      );
    }

    load();
  }

  Future<void> deleteAll() async {
    if (deletionLocked ||
        files.isEmpty) {
      return;
    }

    final credentials =
        await showDeletionDialog(
      context,
      'Delete ALL cloud backups?',
      'This deletes cloud backup copies only. It does not delete files from either phone.',
    );

    if (credentials == null) {
      return;
    }

    final r = await http.post(
      Uri.parse(
        '$apiBaseUrl/api/files/delete-all',
      ),
      headers: headers,
      body: jsonEncode(
        credentials,
      ),
    );

    if (!mounted) return;

    if (r.statusCode == 200) {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'All cloud backup copies deleted.',
          ),
        ),
      );
    } else if (r.statusCode == 423) {
      setState(() {
        deletionLocked = true;
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'Deletion controls are temporarily locked.',
          ),
        ),
      );
    } else {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content:
              Text(errorText(r)),
        ),
      );
    }

    load();
  }

  Future<void> download(
    Map f,
  ) async {
    final r = await http.get(
      Uri.parse(
        '$apiBaseUrl/api/files/${f['id']}/download',
      ),
      headers: headers,
    );

    if (!mounted) return;

    if (r.statusCode == 200) {
      final data =
          jsonDecode(r.body);

      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text(
            'Download link',
          ),
          content: SelectableText(
            data['downloadUrl'] ??
                '',
          ),
          actions: [
            TextButton(
              onPressed: () =>
                  Navigator.pop(
                context,
              ),
              child:
                  const Text('Close'),
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content:
              Text(errorText(r)),
        ),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Cloud-Zen Master',
        ),
        actions: [
          IconButton(
            onPressed: load,
            icon: const Icon(
              Icons.refresh,
            ),
          ),
        ],
      ),

      floatingActionButton:
          FloatingActionButton.extended(
        onPressed: addDevice,
        icon: const Icon(
          Icons.qr_code_2,
        ),
        label: const Text(
          'Pair device',
        ),
      ),

      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding:
              const EdgeInsets.all(16),
          children: [
            const Text(
              'Connected devices',
              style: TextStyle(
                fontSize: 24,
                fontWeight:
                    FontWeight.w800,
              ),
            ),

            const SizedBox(
              height: 8,
            ),

            if (loading)
              const LinearProgressIndicator(),

            Card(
              child: ListTile(
                leading: const Icon(
                  Icons.android,
                ),
                title: const Text(
                  'Client APK download QR',
                ),
                subtitle: const Text(
                  'Scan with the second phone to open the APK URL.',
                ),
                trailing: IconButton(
                  onPressed: () =>
                      Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          const ApkQrPage(),
                    ),
                  ),
                  icon: const Icon(
                    Icons.qr_code_2,
                  ),
                ),
              ),
            ),

            if (devices.isEmpty &&
                !loading)
              const Card(
                child: Padding(
                  padding:
                      EdgeInsets.all(20),
                  child: Text(
                    'No device paired yet. Tap Pair device.',
                  ),
                ),
              ),

            ...devices.map(
              (d) => Card(
                child: Padding(
                  padding:
                      const EdgeInsets.all(
                    12,
                  ),
                  child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment
                            .start,
                    children: [
                      ListTile(
                        contentPadding:
                            EdgeInsets.zero,
                        leading:
                            const Icon(
                          Icons.smartphone,
                          size: 36,
                        ),
                        title: Text(
                          d['name'] ??
                              'Android Device',
                        ),
                        subtitle: Text(
                          '${d['model'] ?? ''} • ${d['os_version'] ?? ''}',
                        ),
                      ),

                      SwitchListTile(
                        contentPadding:
                            EdgeInsets.zero,
                        title: const Text(
                          'Backup permission',
                        ),
                        subtitle:
                            const Text(
                          'The client may upload only while this permission is enabled.',
                        ),
                        value:
                            d['backup_enabled'] ==
                                true,
                        onChanged: (v) =>
                            setBackup(
                          d['id'],
                          v,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(
              height: 20,
            ),

            Row(
              mainAxisAlignment:
                  MainAxisAlignment
                      .spaceBetween,
              children: [
                const Text(
                  'Cloud backups',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight:
                        FontWeight.w800,
                  ),
                ),

                if (!deletionLocked)
                  TextButton.icon(
                    onPressed:
                        files.isEmpty
                            ? null
                            : deleteAll,
                    icon: const Icon(
                      Icons.delete_sweep,
                    ),
                    label:
                        const Text(
                      'Delete all',
                    ),
                  ),

                if (deletionLocked)
                  const Chip(
                    label: Text(
                      'Deletion locked',
                    ),
                  ),
              ],
            ),

            const SizedBox(
              height: 8,
            ),

            if (files.isEmpty)
              const Card(
                child: Padding(
                  padding:
                      EdgeInsets.all(20),
                  child: Text(
                    'No uploaded backup files yet.',
                  ),
                ),
              ),

            ...files.map(
              (f) => Card(
                child: ListTile(
                  leading:
                      const Icon(
                    Icons
                        .insert_drive_file_outlined,
                  ),
                  title: Text(
                    f['relative_path'] ??
                        'File',
                  ),
                  subtitle: Text(
                    '${formatBytes(f['size_bytes'])} • ${f['device_name'] ?? 'Device'}',
                  ),
                  trailing: Wrap(
                    spacing: 2,
                    children: [
                      IconButton(
                        onPressed: () =>
                            download(f),
                        icon:
                            const Icon(
                          Icons.download,
                        ),
                      ),

                      if (!deletionLocked)
                        IconButton(
                          onPressed: () =>
                              deleteFile(
                            f,
                          ),
                          icon:
                              const Icon(
                            Icons
                                .delete_outline,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(
              height: 20,
            ),

            const Text(
              'Backup activity',
              style: TextStyle(
                fontSize: 24,
                fontWeight:
                    FontWeight.w800,
              ),
            ),

            ...backups.map(
              (b) => ListTile(
                leading: const Icon(
                  Icons.cloud_upload,
                ),
                title: Text(
                  b['device_name'] ??
                      'Device',
                ),
                subtitle: Text(
                  '${b['status']} • ${b['files_uploaded']}/${b['files_total']} files • ${formatBytes(b['bytes_uploaded'])}/${formatBytes(b['bytes_total'])}',
                ),
              ),
            ),

            const SizedBox(
              height: 100,
            ),
          ],
        ),
      ),
    );
  }
}

Future<Map<String, String>?>
    showDeletionDialog(
  BuildContext context,
  String title,
  String message,
) async {
  final email =
      TextEditingController();

  final password =
      TextEditingController();

  return showDialog<
      Map<String, String>>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),

      content: Column(
        mainAxisSize:
            MainAxisSize.min,
        children: [
          Text(message),

          const SizedBox(
            height: 14,
          ),

          TextField(
            controller: email,
            keyboardType:
                TextInputType
                    .emailAddress,
            decoration:
                const InputDecoration(
              labelText:
                  'Account email',
            ),
          ),

          TextField(
            controller: password,
            obscureText: true,
            decoration:
                const InputDecoration(
              labelText:
                  'Account password',
            ),
          ),
        ],
      ),

      actions: [
        TextButton(
          onPressed: () =>
              Navigator.pop(
            context,
          ),
          child:
              const Text('Cancel'),
        ),

        FilledButton(
          onPressed: () =>
              Navigator.pop(
            context,
            {
              'email':
                  email.text.trim(),
              'password':
                  password.text,
            },
          ),
          child: const Text(
            'Confirm delete',
          ),
        ),
      ],
    ),
  );
}

class PairingPage
    extends StatefulWidget {
  final String token;
  final String sessionId;
  final Map qrPayload;

  const PairingPage({
    super.key,
    required this.token,
    required this.sessionId,
    required this.qrPayload,
  });

  @override
  State<PairingPage> createState() =>
      _PairingPageState();
}

class _PairingPageState
    extends State<PairingPage> {
  Timer? timer;

  String status =
      'Waiting for the second phone…';

  @override
  void initState() {
    super.initState();

    timer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => poll(),
    );
  }

  Future<void> poll() async {
    try {
      final r = await http.get(
        Uri.parse(
          '$apiBaseUrl/api/pairing/session/${widget.sessionId}',
        ),
        headers: {
          'Authorization':
              'Bearer ${widget.token}',
        },
      );

      if (r.statusCode != 200 ||
          !mounted) {
        return;
      }

      final d =
          jsonDecode(r.body);

      setState(() {
        status =
            'Status: ${d['status']}';
      });

      if (d['status'] ==
              'paired' ||
          d['status'] ==
              'expired') {
        timer?.cancel();
      }
    } catch (_) {}
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
        title: const Text(
          'Pair Cloud-Zen Client',
        ),
      ),

      body: Center(
        child: SingleChildScrollView(
          padding:
              const EdgeInsets.all(24),
          child: Column(
            mainAxisSize:
                MainAxisSize.min,
            children: [
              const Text(
                'On the second phone, install Cloud-Zen Client and scan this QR. Pairing requires explicit consent.',
                textAlign:
                    TextAlign.center,
              ),

              const SizedBox(
                height: 20,
              ),

              QrImageView(
                data: jsonEncode(
                  widget.qrPayload,
                ),
                size: 280,
                backgroundColor:
                    Colors.white,
              ),

              const SizedBox(
                height: 16,
              ),

              Text(status),

              const SizedBox(
                height: 20,
              ),

              if ((widget.qrPayload[
                          'apkUrl'] ??
                      '')
                  .toString()
                  .isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () =>
                      showDialog(
                    context: context,
                    builder: (_) =>
                        AlertDialog(
                      title: const Text(
                        'Client APK URL',
                      ),
                      content:
                          SelectableText(
                        widget.qrPayload[
                                'apkUrl']
                            .toString(),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () =>
                              Navigator.pop(
                            context,
                          ),
                          child:
                              const Text(
                            'Close',
                          ),
                        ),
                      ],
                    ),
                  ),
                  icon: const Icon(
                    Icons.download,
                  ),
                  label: const Text(
                    'APK download URL',
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ApkQrPage
    extends StatelessWidget {
  const ApkQrPage({super.key});

  @override
  Widget build(BuildContext context) {
    const url = String.fromEnvironment(
      'CLIENT_APK_URL',
      defaultValue: '',
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Client APK QR',
        ),
      ),

      body: Center(
        child: Padding(
          padding:
              const EdgeInsets.all(24),
          child: url.isEmpty
              ? const Text(
                  'No CLIENT_APK_URL was supplied to this build.',
                  textAlign:
                      TextAlign.center,
                )
              : Column(
                  mainAxisSize:
                      MainAxisSize.min,
                  children: [
                    QrImageView(
                      data: url,
                      size: 280,
                      backgroundColor:
                          Colors.white,
                    ),

                    const SizedBox(
                      height: 18,
                    ),

                    SelectableText(
                      url,
                      textAlign:
                          TextAlign.center,
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
