import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:qr_flutter/qr_flutter.dart';

const apiBaseUrl = 'https://YOUR-RENDER-SERVICE.onrender.com';

void main() => runApp(const CloudZenMaster());

class CloudZenMaster extends StatelessWidget {
  const CloudZenMaster({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Cloud-Zen',
    theme: ThemeData.dark(useMaterial3: true),
    home: const LoginPage(),
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController(text: 'demo@example.com');
  final password = TextEditingController(text: 'ChangeMe123!');
  bool loading = false;

  Future<void> login() async {
    setState(() => loading = true);
    try {
      final r = await http.post(
        Uri.parse('$apiBaseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email.text, 'password': password.text}),
      );
      final data = jsonDecode(r.body);
      if (!mounted) return;
      if (r.statusCode == 200) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => Dashboard(token: data['token'])),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['error'] ?? 'Login failed')),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_done_rounded, size: 76),
          const SizedBox(height: 16),
          const Text('Cloud-Zen', style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold)),
          const SizedBox(height: 22),
          TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
          TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: loading ? null : login,
            child: Text(loading ? 'Signing in…' : 'Sign in'),
          ),
        ]),
      ),
    ),
  );
}

class Dashboard extends StatefulWidget {
  final String token;
  const Dashboard({super.key, required this.token});
  @override State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> {
  List devices = [];
  List backups = [];
  bool loading = true;

  Map<String, String> get headers => {
    'Authorization': 'Bearer ${widget.token}',
    'Content-Type': 'application/json',
  };

  Future<void> load() async {
    try {
      final d = await http.get(
        Uri.parse('$apiBaseUrl/api/devices'),
        headers: headers,
      );
      final b = await http.get(
        Uri.parse('$apiBaseUrl/api/backups'),
        headers: headers,
      );
      if (!mounted) return;
      setState(() {
        if (d.statusCode == 200) devices = jsonDecode(d.body)['devices'];
        if (b.statusCode == 200) backups = jsonDecode(b.body)['backups'];
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> addDevice() async {
    final r = await http.post(
      Uri.parse('$apiBaseUrl/api/pairing/session'),
      headers: headers,
    );
    if (r.statusCode != 200 || !mounted) return;
    final data = jsonDecode(r.body);
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PairingPage(
          token: widget.token,
          sessionId: data['sessionId'],
          qrPayload: data['qrPayload'],
        ),
      ),
    );
    load();
  }

  Future<void> setBackup(String id, bool enabled) async {
    await http.patch(
      Uri.parse('$apiBaseUrl/api/devices/$id/backup'),
      headers: headers,
      body: jsonEncode({'enabled': enabled}),
    );
    load();
  }

  Future<void> startBackup(String id) async {
    final r = await http.post(
      Uri.parse('$apiBaseUrl/api/backups/jobs'),
      headers: headers,
      body: jsonEncode({'deviceId': id}),
    );
    if (!mounted) return;
    final data = jsonDecode(r.body);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(
        r.statusCode == 201 ? 'Backup job queued.' : (data['error'] ?? 'Backup could not start'),
      )),
    );
    load();
  }

  @override void initState() { super.initState(); load(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Cloud-Zen')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: addDevice,
      icon: const Icon(Icons.add_link),
      label: const Text('Add device'),
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Connected devices', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          if (loading) const LinearProgressIndicator(),
          ...devices.map((d) => Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.smartphone),
                  title: Text(d['name'] ?? 'Device'),
                  subtitle: Text('${d['platform'] ?? ''} • ${d['model'] ?? ''}'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Backup permission'),
                  subtitle: const Text('Allows this device to create backup jobs.'),
                  value: d['backup_enabled'] == true,
                  onChanged: (v) => setBackup(d['id'], v),
                ),
                if (d['backup_enabled'] == true)
                  OutlinedButton.icon(
                    onPressed: () => startBackup(d['id']),
                    icon: const Icon(Icons.backup),
                    label: const Text('Queue backup'),
                  ),
              ]),
            ),
          )),
          const SizedBox(height: 18),
          const Text('Backup jobs', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          ...backups.map((b) => ListTile(
            leading: const Icon(Icons.cloud_upload),
            title: Text(b['device_name'] ?? 'Device'),
            subtitle: Text('${b['status']} • ${b['files_uploaded']}/${b['files_total']} files'),
          )),
        ],
      ),
    ),
  );
}

class PairingPage extends StatefulWidget {
  final String token, sessionId;
  final Map qrPayload;
  const PairingPage({super.key, required this.token, required this.sessionId, required this.qrPayload});
  @override State<PairingPage> createState() => _PairingPageState();
}

class _PairingPageState extends State<PairingPage> {
  Timer? timer;
  String status = 'Waiting for approval…';

  @override void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 2), (_) => poll());
  }

  Future<void> poll() async {
    final r = await http.get(
      Uri.parse('$apiBaseUrl/api/pairing/session/${widget.sessionId}'),
      headers: {'Authorization': 'Bearer ${widget.token}'},
    );
    if (r.statusCode != 200) return;
    final data = jsonDecode(r.body);
    if (!mounted) return;
    setState(() => status = 'Status: ${data['status']}');
    if (data['status'] == 'paired' || data['status'] == 'expired') {
      timer?.cancel();
    }
  }

  @override void dispose() { timer?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Pair Device')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Scan this QR from the client device. Pairing must be approved there.'),
          const SizedBox(height: 20),
          QrImageView(data: jsonEncode(widget.qrPayload), size: 280, backgroundColor: Colors.white),
          const SizedBox(height: 18),
          Text(status),
        ]),
      ),
    ),
  );
}
