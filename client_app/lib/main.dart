import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';

void main() => runApp(const CloudZenClient());

class CloudZenClient extends StatelessWidget {
  const CloudZenClient({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Cloud-Zen Client',
    theme: ThemeData.dark(useMaterial3: true),
    home: const ClientHome(),
  );
}

class ClientHome extends StatefulWidget {
  const ClientHome({super.key});
  @override State<ClientHome> createState() => _ClientHomeState();
}

class _ClientHomeState extends State<ClientHome> {
  String message = 'Connect this device by scanning a Cloud-Zen pairing QR.';
  String? server;
  String? deviceId;
  bool busy = false;
  List<PlatformFile> selectedFiles = [];

  Future<Map<String, dynamic>> deviceMeta() async {
    final info = DeviceInfoPlugin();
    String model = 'Android Device';
    String os = 'unknown';

    if (Platform.isAndroid) {
      final a = await info.androidInfo;
      model = a.model;
      os = '${a.version.release} (SDK ${a.version.sdkInt})';
    } else if (Platform.isIOS) {
      final i = await info.iosInfo;
      model = i.utsname.machine;
      os = i.systemVersion;
    }

    return {
      'name': model,
      'model': model,
      'platform': Platform.operatingSystem,
      'osVersion': os,
    };
  }

  Future<void> scanAndPair() async {
    final raw = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const ScannerPage()),
    );
    if (raw == null) return;

    setState(() { busy = true; message = 'Checking pairing request…'; });

    try {
      final data = jsonDecode(raw);
      if (data['type'] != 'cloud-zen-pair' ||
          data['token'] == null ||
          data['server'] == null) {
        throw Exception('Invalid QR');
      }

      final meta = await deviceMeta();

      final r = await http.post(
        Uri.parse('${data['server']}/api/pairing/approve'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'token': data['token'],
          'consent': true,
          'device': meta,
        }),
      );

      final body = jsonDecode(r.body);
      if (!mounted) return;

      if (r.statusCode == 200) {
        deviceId = body['device']['id'];
        server = data['server'];
        message = 'Device paired. You can now choose files for backup.';
      } else {
        message = body['error'] ?? 'Pairing failed';
      }
    } catch (_) {
      message = 'Invalid or expired pairing QR.';
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> selectFiles() async {
    if (deviceId == null || server == null) {
      setState(() => message = 'Pair this device first.');
      return;
    }

    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: false,
    );
    if (result == null) return;

    setState(() {
      selectedFiles = result.files;
      message = '${selectedFiles.length} file(s) selected for the next backup manifest.';
    });
  }

  Future<String> hashFile(String path) async {
    final file = File(path);
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString();
  }

  Future<void> sendManifest() async {
    if (deviceId == null || server == null || selectedFiles.isEmpty) {
      setState(() => message = 'Pair the device and select at least one file.');
      return;
    }

    setState(() { busy = true; message = 'Preparing backup manifest…'; });

    try {
      final job = await http.post(
        Uri.parse('$server/api/backups/jobs'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'deviceId': deviceId}),
      );

      if (job.statusCode != 201) {
        throw Exception('Backup permission is not enabled yet.');
      }

      final jobId = jsonDecode(job.body)['job']['id'];
      final files = <Map<String, dynamic>>[];

      for (final f in selectedFiles) {
        if (f.path == null) continue;
        final hash = await hashFile(f.path!);
        files.add({
          'relativePath': f.name,
          'sizeBytes': f.size,
          'modifiedAt': null,
          'contentHash': hash,
        });
      }

      final r = await http.post(
        Uri.parse('$server/api/backups/manifest'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'jobId': jobId, 'files': files}),
      );

      if (!mounted) return;
      setState(() => message = r.statusCode == 200
          ? 'Backup manifest saved. Upload engine comes next.'
          : 'Manifest upload failed.');
    } catch (e) {
      if (mounted) setState(() => message = 'Backup could not start. Enable backup permission in Master first.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Cloud-Zen Client')),
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.backup_rounded, size: 76),
          const SizedBox(height: 18),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: busy ? null : scanAndPair,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scan Pairing QR'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: busy ? null : selectFiles,
            icon: const Icon(Icons.folder_open),
            label: const Text('Choose Backup Files'),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: busy ? null : sendManifest,
            icon: const Icon(Icons.cloud_upload),
            label: const Text('Prepare Backup'),
          ),
          if (selectedFiles.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text('${selectedFiles.length} selected file(s)'),
          ],
          const SizedBox(height: 18),
          const Text(
            'Only files you explicitly select are prepared for backup.',
            textAlign: TextAlign.center,
          ),
        ]),
      ),
    ),
  );
}

class ScannerPage extends StatelessWidget {
  const ScannerPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Scan Cloud-Zen QR')),
    body: MobileScanner(
      onDetect: (capture) {
        for (final barcode in capture.barcodes) {
          final value = barcode.rawValue;
          if (value != null) {
            Navigator.pop(context, value);
            return;
          }
        }
      },
    ),
  );
}
