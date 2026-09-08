import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://cloud-zen-backend.onrender.com',
);

void main() {
  runApp(const CloudZenClient());
}

class CloudZenClient extends StatelessWidget {
  const CloudZenClient({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Cloud-Zen Client',
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

    return handle(response);
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

    return handle(response);
  }

  dynamic handle(http.Response response) {
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
          builder: (_) => const ClientHome(),
        ),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e
              .toString()
              .replaceFirst(
                'Exception: ',
                '',
              );
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
          padding:
              const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(
              maxWidth: 460,
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.backup_rounded,
                  size: 76,
                  color:
                      Color(0xFFD7C4FF),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Cloud-Zen Client',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight:
                        FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 30),
                TextField(
                  controller: email,
                  keyboardType:
                      TextInputType
                          .emailAddress,
                  decoration:
                      const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(
                      Icons
                          .email_outlined,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration:
                      const InputDecoration(
                    labelText: 'Password',
                    prefixIcon: Icon(
                      Icons.lock_outline,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (error.isNotEmpty)
                  Text(
                    error,
                    textAlign:
                        TextAlign.center,
                    style:
                        const TextStyle(
                      color:
                          Colors.redAccent,
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
                            register =
                                !register;
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
                  style:
                      const TextStyle(
                    fontSize: 11,
                    color:
                        Colors.white30,
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

class ClientHome extends StatefulWidget {
  const ClientHome({super.key});

  @override
  State<ClientHome> createState() =>
      _ClientHomeState();
}

class _ClientHomeState
    extends State<ClientHome> {
  String? deviceId;

  String deviceName =
      'Android Device';

  bool backupEnabled = false;

  String status =
      'Registering device…';

  double progress = 0;

  String? uploadedFile;

  @override
  void initState() {
    super.initState();
    registerDevice();
  }

  Future<String> deviceKey() async {
    final info =
        DeviceInfoPlugin();

    if (Platform.isAndroid) {
      final android =
          await info.androidInfo;

      final raw =
          '${android.brand}|'
          '${android.model}|'
          '${android.id}|'
          '${android.device}';

      return sha256
          .convert(
            utf8.encode(raw),
          )
          .toString();
    }

    return sha256
        .convert(
          utf8.encode(
            Platform.operatingSystem,
          ),
        )
        .toString();
  }

  Future<void> registerDevice() async {
    try {
      final key =
          await deviceKey();

      final info =
          await DeviceInfoPlugin()
              .androidInfo;

      final result =
          await api.post(
        '/api/devices/register',
        {
          'name': info.model,
          'deviceKey': key,
        },
      );

      if (!mounted) return;

      setState(() {
        deviceId = result['id'];
        deviceName =
            result['name'] ??
                info.model;
        backupEnabled =
            result['backup_enabled'] ==
                true;
        status =
            'Device ready';
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          status = e
              .toString()
              .replaceFirst(
                'Exception: ',
                '',
              );
        });
      }
    }
  }

  Future<void> scanQr() async {
    final payload =
        await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            const ScannerPage(),
      ),
    );

    if (payload == null ||
        payload.isEmpty) {
      return;
    }

    try {
      final key =
          await deviceKey();

      final result =
          await api.post(
        '/api/pairing/claim',
        {
          'qrPayload': payload,
          'deviceName': deviceName,
          'deviceKey': key,
        },
      );

      if (!mounted) return;

      setState(() {
        deviceId =
            result['device']['id'];
        backupEnabled =
            result['device']
                    ['backup_enabled'] ==
                true;
        status =
            'Paired with Master';
      });

      snack(
        'Pairing successful. Master can now enable backup.',
      );
    } catch (e) {
      snack(
        e.toString()
            .replaceFirst(
              'Exception: ',
              '',
            ),
      );
    }
  }

  Future<void> chooseFile() async {
    if (deviceId == null) {
      snack(
        'Device is not registered.',
      );
      return;
    }

    if (!backupEnabled) {
      snack(
        'Master has not enabled backup permission.',
      );
      return;
    }

    final result =
        await FilePicker.platform
            .pickFiles(
      allowMultiple: false,
      withData: false,
    );

    if (result == null ||
        result.files.isEmpty) {
      return;
    }

    final selected =
        result.files.single;

    final filePath =
        selected.path;

    if (filePath == null) {
      snack(
        'The selected provider did not return a local file path.',
      );
      return;
    }

    final file =
        File(filePath);

    final size =
        await file.length();

    setState(() {
      progress = 0;
      uploadedFile = null;
    });

    try {
      final init =
          await api.post(
        '/api/uploads/initiate',
        {
          'deviceId': deviceId,
          'name': selected.name,
          'size': size,
          'mimeType':
              mimeType(
            selected.extension,
          ),
        },
      );

      final chunkSize =
          (init['chunkSize']
                  as num)
              .toInt();

      final urls =
          List<Map<String,
              dynamic>>.from(
        (init['urls'] as List)
            .map(
          (x) =>
              Map<String,
                  dynamic>.from(x),
        ),
      );

      final uploadParts =
          <Map<String, dynamic>>[];

      final randomAccess =
          await file.open();

      try {
        for (
          int index = 0;
          index < urls.length;
          index++
        ) {
          final partNumber =
              (urls[index]
                          ['partNumber']
                      as num)
                  .toInt();

          final start =
              (partNumber - 1) *
                  chunkSize;

          final remaining =
              size - start;

          final length =
              remaining >
                      chunkSize
                  ? chunkSize
                  : remaining;

          await randomAccess
              .setPosition(start);

          final bytes =
              await randomAccess
                  .read(length);

          final response =
              await http.put(
            Uri.parse(
              urls[index]['url'],
            ),
            headers: {
              'Content-Length':
                  '${bytes.length}',
            },
            body: bytes,
          );

          if (response.statusCode <
                  200 ||
              response.statusCode >=
                  300) {
            throw Exception(
              'Cloud upload failed on part $partNumber.',
            );
          }

          final etag =
              response.headers[
                  'etag'];

          if (etag == null ||
              etag.isEmpty) {
            throw Exception(
              'Storage did not return ETag.',
            );
          }

          uploadParts.add({
            'partNumber':
                partNumber,
            'etag': etag,
          });

          if (mounted) {
            setState(() {
              progress =
                  (index + 1) /
                      urls.length;
            });
          }
        }
      } finally {
        await randomAccess.close();
      }

      await api.post(
        '/api/uploads/complete',
        {
          'fileId':
              init['fileId'],
          'uploadId':
              init['uploadId'],
          'objectKey':
              init['objectKey'],
          'parts':
              uploadParts,
        },
      );

      if (!mounted) return;

      setState(() {
        uploadedFile =
            selected.name;
        progress = 1;
      });

      snack(
        'File uploaded successfully.',
      );
    } catch (e) {
      snack(
        e.toString()
            .replaceFirst(
              'Exception: ',
              '',
            ),
      );
    }
  }

  String mimeType(
    String? extension,
  ) {
    switch (
        (extension ?? '')
            .toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';

      case 'png':
        return 'image/png';

      case 'gif':
        return 'image/gif';

      case 'pdf':
        return 'application/pdf';

      case 'mp4':
        return 'video/mp4';

      case 'mp3':
        return 'audio/mpeg';

      case 'zip':
        return 'application/zip';

      default:
        return 'application/octet-stream';
    }
  }

  void snack(String text) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(
        content: Text(text),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title:
            const Text('Cloud-Zen Client'),
        actions: [
          IconButton(
            onPressed:
                registerDevice,
            icon:
                const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
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
                children: [
                  const Text(
                    'Device Status',
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),
                  const SizedBox(
                      height: 10),
                  Text(deviceName),
                  const SizedBox(
                      height: 5),
                  Text(
                    status,
                    style:
                        const TextStyle(
                      color:
                          Colors.white60,
                    ),
                  ),
                  const SizedBox(
                      height: 16),
                  Row(
                    children: [
                      Icon(
                        backupEnabled
                            ? Icons
                                .verified
                            : Icons
                                .lock_outline,
                        color:
                            backupEnabled
                                ? Colors
                                    .greenAccent
                                : Colors
                                    .orangeAccent,
                      ),
                      const SizedBox(
                          width: 10),
                      Expanded(
                        child: Text(
                          backupEnabled
                              ? 'Backup permission ON'
                              : 'Backup permission OFF',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 54,
            child: FilledButton.icon(
              onPressed: scanQr,
              icon: const Icon(
                Icons
                    .qr_code_scanner,
              ),
              label: const Text(
                'Scan Master QR',
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 54,
            child: FilledButton.icon(
              onPressed: chooseFile,
              icon: const Icon(
                Icons.attach_file,
              ),
              label: const Text(
                'Choose File & Upload',
              ),
            ),
          ),
          if (progress > 0 &&
              progress < 1) ...[
            const SizedBox(
                height: 18),
            LinearProgressIndicator(
              value: progress,
            ),
            const SizedBox(
                height: 8),
            Text(
              '${(progress * 100).toStringAsFixed(0)}%',
            ),
          ],
          if (uploadedFile != null)
            Padding(
              padding:
                  const EdgeInsets.only(
                top: 18,
              ),
              child: Card(
                child: ListTile(
                  leading: const Icon(
                    Icons
                        .check_circle,
                    color:
                        Colors.greenAccent,
                  ),
                  title:
                      Text(uploadedFile!),
                  subtitle:
                      const Text(
                    'Upload completed',
                  ),
                ),
              ),
            ),
          const SizedBox(height: 24),
          const Text(
            'How it works',
            style: TextStyle(
              fontSize: 19,
              fontWeight:
                  FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '1. Login\n'
            '2. Scan Master QR\n'
            '3. Master enables backup permission\n'
            '4. Choose a file\n'
            '5. File is uploaded to the configured cloud storage',
            style: TextStyle(
              color: Colors.white60,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

class ScannerPage extends StatefulWidget {
  const ScannerPage({super.key});

  @override
  State<ScannerPage> createState() =>
      _ScannerPageState();
}

class _ScannerPageState
    extends State<ScannerPage> {
  bool found = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title:
            const Text('Scan Master QR'),
      ),
      body: MobileScanner(
        onDetect: (capture) {
          if (found) return;

          for (final barcode
              in capture.barcodes) {
            final value =
                barcode.rawValue;

            if (value != null &&
                value.startsWith(
                    'CZ1:')) {
              found = true;

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
