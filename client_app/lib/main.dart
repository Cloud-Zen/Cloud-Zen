import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';

void main() => runApp(const CloudZenClient());

String formatBytes(int n) {
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) {
    return '${(n / 1024).toStringAsFixed(1)} KB';
  }
  if (n < 1024 * 1024 * 1024) {
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  return '${(n / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}

class CloudZenClient extends StatelessWidget {
  const CloudZenClient({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Cloud-Zen Client',
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xffb9c9ff),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xff07080d),
      ),
      home: const ClientHome(),
    );
  }
}

class ClientHome extends StatefulWidget {
  const ClientHome({super.key});

  @override
  State<ClientHome> createState() => _ClientHomeState();
}

class _ClientHomeState extends State<ClientHome> {
  String server = '';
  String? deviceId;
  String? deviceToken;

  bool backupEnabled = false;
  bool busy = false;

  double progress = 0;

  String message =
      'Scan the pairing QR shown on the Master phone.';

  List<PlatformFile> selectedFiles = [];

  Future<Map<String, dynamic>> deviceMeta() async {
    final info = DeviceInfoPlugin();

    if (Platform.isAndroid) {
      final a = await info.androidInfo;

      return {
        'name': a.model,
        'model': a.model,
        'platform': 'android',
        'osVersion':
            '${a.version.release} (SDK ${a.version.sdkInt})',
      };
    }

    return {
      'name': 'Mobile Device',
      'model': 'Mobile',
      'platform': Platform.operatingSystem,
      'osVersion': 'unknown',
    };
  }

  Future<void> scanAndPair() async {
    final raw = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => const ScannerPage(),
      ),
    );

    if (raw == null) return;

    setState(() {
      busy = true;
      message = 'Checking pairing request…';
    });

    try {
      final data = jsonDecode(raw);

      if (data['type'] != 'cloud-zen-pair' ||
          data['token'] == null ||
          data['server'] == null) {
        throw Exception('Invalid QR');
      }

      final meta = await deviceMeta();

      final base = data['server']
          .toString()
          .replaceAll(RegExp(r'/+$'), '');

      final r = await http.post(
        Uri.parse('$base/api/pairing/approve'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'token': data['token'],
          'consent': true,
          'device': meta,
        }),
      );

      final body = jsonDecode(r.body);

      if (r.statusCode != 200) {
        throw Exception(
          body['error'] ?? 'Pairing failed',
        );
      }

      deviceId = body['device']['id'];
      deviceToken = body['deviceToken'];
      server = base;

      backupEnabled =
          body['device']['backup_enabled'] == true;

      message = backupEnabled
          ? 'Paired. Backup permission is ON.'
          : 'Paired. Enable Backup permission on the Master phone.';

      await heartbeat();
    } catch (e) {
      message = 'Pairing failed: $e';
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  Future<void> heartbeat() async {
    if (server.isEmpty ||
        deviceId == null ||
        deviceToken == null) {
      return;
    }

    try {
      await http.post(
        Uri.parse(
          '$server/api/devices/$deviceId/heartbeat',
        ),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Device $deviceToken',
        },
        body: jsonEncode({}),
      );
    } catch (_) {}
  }

  Future<void> selectFiles() async {
    if (deviceId == null) {
      setState(() {
        message = 'Pair this device first.';
      });
      return;
    }

    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: false,
    );

    if (result == null) return;

    final total = result.files.fold<int>(
      0,
      (a, f) => a + f.size,
    );

    setState(() {
      selectedFiles = result.files;

      message =
          '${selectedFiles.length} file(s) selected • ${formatBytes(total)}';
    });
  }

  Future<String> hashFile(String path) async {
    final file = File(path);

    final digest = await sha256
        .bind(file.openRead())
        .first;

    return digest.toString();
  }

  Future<http.StreamedResponse> putFile(
    String url,
    File file,
    String contentType,
    void Function(int sent) onProgress,
  ) async {
    final length = await file.length();

    final request = http.StreamedRequest(
      'PUT',
      Uri.parse(url),
    );

    request.contentLength = length;

    request.headers['Content-Type'] =
        contentType;

    var sent = 0;

    file.openRead().listen(
      (chunk) {
        sent += chunk.length;

        onProgress(sent);

        request.sink.add(chunk);
      },
      onDone: () {
        request.sink.close();
      },
      onError: (e) {
        request.sink.addError(e);
      },
    );

    return request.send();
  }

  Future<void> startBackup() async {
    if (deviceId == null ||
        deviceToken == null ||
        server.isEmpty) {
      setState(() {
        message = 'Pair this device first.';
      });
      return;
    }

    if (selectedFiles.isEmpty) {
      setState(() {
        message = 'Choose files first.';
      });
      return;
    }

    setState(() {
      busy = true;
      progress = 0;
      message = 'Creating secure backup job…';
    });

    try {
      final headers = {
        'Authorization': 'Device $deviceToken',
        'Content-Type': 'application/json',
      };

      final jobR = await http.post(
        Uri.parse(
          '$server/api/backups/client-job',
        ),
        headers: headers,
        body: '{}',
      );

      if (jobR.statusCode != 201) {
        final body = jsonDecode(jobR.body);

        throw Exception(
          body['error'] ??
              'Backup permission is disabled',
        );
      }

      final jobId =
          jsonDecode(jobR.body)['job']['id'];

      final manifest =
          <Map<String, dynamic>>[];

      final uploadFiles =
          <PlatformFile>[];

      for (final f in selectedFiles) {
        if (f.path == null) continue;

        final file = File(f.path!);

        final size = await file.length();

        uploadFiles.add(f);

        manifest.add({
          'relativePath': f.name,
          'sizeBytes': size,
          'modifiedAt': null,
          'contentHash':
              await hashFile(f.path!),
        });
      }

      final manifestResponse =
          await http.post(
        Uri.parse(
          '$server/api/backups/client-manifest',
        ),
        headers: headers,
        body: jsonEncode({
          'jobId': jobId,
          'files': manifest,
        }),
      );

      if (manifestResponse.statusCode != 200) {
        final body =
            jsonDecode(manifestResponse.body);

        throw Exception(
          body['error'] ??
              'Manifest failed',
        );
      }

      var completedBytes = 0;

      final totalBytes =
          manifest.fold<int>(
        0,
        (a, f) =>
            a + (f['sizeBytes'] as int),
      );

      for (var i = 0;
          i < manifest.length;
          i++) {
        final meta = manifest[i];

        final path = uploadFiles[i].path;

        if (path == null) continue;

        final file = File(path);

        final ticket = await http.post(
          Uri.parse(
            '$server/api/backups/upload-ticket',
          ),
          headers: headers,
          body: jsonEncode({
            'jobId': jobId,
            'relativePath':
                meta['relativePath'],
            'contentType':
                'application/octet-stream',
          }),
        );

        if (ticket.statusCode != 200) {
          final body =
              jsonDecode(ticket.body);

          throw Exception(
            body['error'] ??
                'Could not create upload URL',
          );
        }

        final ticketData =
            jsonDecode(ticket.body);

        setState(() {
          message =
              'Uploading ${meta['relativePath']} • ${i + 1}/${manifest.length}';
        });

        final response = await putFile(
          ticketData['uploadUrl'],
          file,
          'application/octet-stream',
          (sent) {
            if (!mounted) return;

            setState(() {
              progress = totalBytes == 0
                  ? 1
                  : (completedBytes + sent) /
                      totalBytes;
            });
          },
        );

        if (response.statusCode < 200 ||
            response.statusCode >= 300) {
          throw Exception(
            'Cloud upload failed (${response.statusCode})',
          );
        }

        final complete =
            await http.post(
          Uri.parse(
            '$server/api/backups/upload-complete',
          ),
          headers: headers,
          body: jsonEncode({
            'deviceId': deviceId,
            'jobId': jobId,
            'manifestId':
                ticketData['manifestId'],
          }),
        );

        if (complete.statusCode != 200) {
          final body =
              jsonDecode(complete.body);

          throw Exception(
            body['error'] ??
                'Upload verification failed',
          );
        }

        completedBytes +=
            meta['sizeBytes'] as int;
      }

      setState(() {
        progress = 1;

        message =
            'Backup completed • ${manifest.length} file(s) • ${formatBytes(totalBytes)}';
      });
    } catch (e) {
      setState(() {
        message =
            'Backup stopped: $e';
      });
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
      appBar: AppBar(
        title: const Text(
          'Cloud-Zen Client',
        ),
        actions: [
          IconButton(
            onPressed:
                busy ? null : heartbeat,
            icon: const Icon(Icons.sync),
          ),
        ],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(
              maxWidth: 560,
            ),
            child: Card(
              child: Padding(
                padding:
                    const EdgeInsets.all(22),
                child: Column(
                  children: [
                    const Icon(
                      Icons.cloud_upload_rounded,
                      size: 76,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Cloud-Zen Backup',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight:
                            FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      message,
                      textAlign:
                          TextAlign.center,
                    ),
                    const SizedBox(height: 14),

                    if (progress > 0)
                      LinearProgressIndicator(
                        value: progress,
                      ),

                    const SizedBox(height: 18),

                    FilledButton.icon(
                      onPressed:
                          busy ? null : scanAndPair,
                      icon: const Icon(
                        Icons.qr_code_scanner,
                      ),
                      label: const Text(
                        'Scan Pairing QR',
                      ),
                    ),

                    const SizedBox(height: 10),

                    OutlinedButton.icon(
                      onPressed:
                          busy ? null : selectFiles,
                      icon: const Icon(
                        Icons.folder_copy_outlined,
                      ),
                      label: const Text(
                        'Choose files / Downloads / media',
                      ),
                    ),

                    const SizedBox(height: 10),

                    FilledButton.icon(
                      onPressed:
                          busy ? null : startBackup,
                      icon: const Icon(
                        Icons.backup,
                      ),
                      label: Text(
                        busy
                            ? 'Backup running…'
                            : 'Start backup',
                      ),
                    ),

                    if (selectedFiles.isNotEmpty) ...[
                      const SizedBox(height: 18),

                      const Align(
                        alignment:
                            Alignment.centerLeft,
                        child: Text(
                          'Selected files',
                          style: TextStyle(
                            fontWeight:
                                FontWeight.bold,
                          ),
                        ),
                      ),

                      const SizedBox(height: 6),

                      ...selectedFiles
                          .take(20)
                          .map(
                            (f) => ListTile(
                              dense: true,
                              leading:
                                  const Icon(
                                Icons
                                    .insert_drive_file,
                              ),
                              title: Text(
                                f.name,
                                maxLines: 1,
                                overflow:
                                    TextOverflow
                                        .ellipsis,
                              ),
                              trailing: Text(
                                formatBytes(
                                  f.size,
                                ),
                              ),
                            ),
                          ),
                    ],

                    const SizedBox(height: 12),

                    Text(
                      backupEnabled
                          ? 'Master permission: ON'
                          : 'Master permission: not confirmed',
                      style: TextStyle(
                        color: backupEnabled
                            ? Colors.greenAccent
                            : Colors.orangeAccent,
                      ),
                    ),

                    const SizedBox(height: 8),

                    const Text(
                      'Cloud-Zen backs up files that you explicitly grant/select. Android does not allow an ordinary app to read other apps’ private data.',
                      textAlign:
                          TextAlign.center,
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

class ScannerPage extends StatelessWidget {
  const ScannerPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Scan Cloud-Zen QR',
        ),
      ),
      body: MobileScanner(
        onDetect: (capture) {
          for (final barcode
              in capture.barcodes) {
            final value =
                barcode.rawValue;

            if (value != null) {
              Navigator.pop(
                context,
                value,
              );
              return;
            }
          }
        },
      ),
    );
  }
}
