from pathlib import Path


def replace(path, old, new):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"missing block in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1))


# Protected backup service: encrypted daily backups + same-device recovery.
replace(
    "desktop/protected-backup.mjs",
    '''  async createAutomaticIfDue() {
    if (!this.automaticPassphrase || !this.database.loadSnapshot()) return null;
    const last = parseMeta(this.database.getMeta("last_auto_backup_at"));
    const lastTime = typeof last === "string" ? Date.parse(last) : 0;
    if (Number.isFinite(lastTime) && Date.now() - lastTime < ONE_DAY_MS) return null;

    const destination = path.join(this.backupDirectory, `academy-hub-auto-${timestamp()}.ahbackup`);
    await this.create(destination, this.automaticPassphrase);
    this.database.setMeta("last_auto_backup_at", new Date().toISOString());
    await this.pruneAutomaticBackups(30);
    return destination;
  }

  async pruneAutomaticBackups(retain = 30) {
    const files = (await readdir(this.backupDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^academy-hub-auto-.*\\.(?:ahbackup|sqlite)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const filename of files.slice(Math.max(1, retain))) {
      await rm(path.join(this.backupDirectory, filename), { force: true });
    }
  }
''',
    '''  async createAutomaticIfDue() {
    if (!this.automaticPassphrase || !this.database.getMeta("settings")) return null;
    const last = parseMeta(this.database.getMeta("last_auto_backup_at"));
    const lastTime = typeof last === "string" ? Date.parse(last) : 0;
    if (Number.isFinite(lastTime) && Date.now() - lastTime < ONE_DAY_MS) return null;

    const destination = path.join(this.backupDirectory, `academy-hub-auto-${timestamp()}.ahbackup`);
    await this.create(destination, this.automaticPassphrase);
    this.database.setMeta("last_auto_backup_at", new Date().toISOString());
    await this.pruneAutomaticBackups(30);
    return destination;
  }

  async latestAutomaticBackup() {
    let entries;
    try {
      entries = await readdir(this.backupDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    const latest = entries
      .filter((entry) => entry.isFile() && /^academy-hub-auto-.*\\.ahbackup$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse()[0];
    return latest ? path.join(this.backupDirectory, latest) : null;
  }

  async restoreLatestAutomatic() {
    if (!this.automaticPassphrase) throw new Error("حماية النسخ التلقائية غير متاحة على هذا الجهاز.");
    const source = await this.latestAutomaticBackup();
    if (!source) throw new Error("لا توجد نسخة احتياطية تلقائية مشفرة متاحة بعد.");

    const temporary = path.join(this.backupDirectory, `.auto-restore-${randomUUID()}.sqlite`);
    try {
      await decryptBackupFile(source, temporary, this.automaticPassphrase);
      const safetyBackup = await this.database.restoreFrom(temporary);
      return { source, safetyBackup };
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async pruneAutomaticBackups(retain = 30) {
    let entries;
    try {
      entries = await readdir(this.backupDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    const files = entries
      .filter((entry) => entry.isFile() && /^academy-hub-auto-.*\\.(?:ahbackup|sqlite)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const filename of files.slice(Math.max(1, retain))) {
      await rm(path.join(this.backupDirectory, filename), { force: true });
    }
  }
''',
)

# Main process: protect the automatic-backup secret with Electron safeStorage.
replace("desktop/main.mjs", 'import { randomUUID } from "node:crypto";', 'import { randomBytes, randomUUID } from "node:crypto";')
replace("desktop/main.mjs", 'import { unlink, writeFile } from "node:fs/promises";', 'import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";')
helper = '''async function loadOrCreateAutomaticBackupPassphrase(userData) {
  const securityDirectory = path.join(userData, "security");
  const keyPath = path.join(securityDirectory, "backup-passphrase.bin");
  await mkdir(securityDirectory, { recursive: true });

  if (!safeStorage.isEncryptionAvailable()) {
    if (app.isPackaged) throw new Error("Windows Secure Storage غير متاح؛ لا يمكن حماية النسخ التلقائية بأمان.");
    return null;
  }

  try {
    const protectedValue = await readFile(keyPath);
    const value = safeStorage.decryptString(protectedValue);
    if (value.length < 20) throw new Error("مفتاح حماية النسخ التلقائية غير صالح.");
    return value;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const value = randomBytes(32).toString("base64url");
  await writeFile(keyPath, safeStorage.encryptString(value), { mode: 0o600 });
  return value;
}

'''
replace("desktop/main.mjs", "function validateSnapshotPayload(snapshot) {", helper + "function validateSnapshotPayload(snapshot) {")
replace(
    "desktop/main.mjs",
    '''  database = await AcademyDatabase.open({ databasePath, backupDirectory });
  protectedBackup = new ProtectedBackupService({ database, backupDirectory });''',
    '''  database = await AcademyDatabase.open({ databasePath, backupDirectory });
  const automaticPassphrase = await loadOrCreateAutomaticBackupPassphrase(userData);
  protectedBackup = new ProtectedBackupService({ database, backupDirectory, automaticPassphrase });''',
)
replace(
    "desktop/main.mjs",
    '    void database.createAutomaticBackupIfDue().catch((error) => log("Automatic backup failed", error));',
    '    void protectedBackup.createAutomaticIfDue().catch((error) => log("Automatic backup failed", error));',
)
restore_handler = '''
  handle("academy:backup:restore-latest-automatic", async () => {
    requireDatabaseAccess();
    restoring = true;
    try {
      const { source, safetyBackup } = await protectedBackup.restoreLatestAutomatic();
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return { cancelled: false, restarting: true, source, safetyBackup };
    } catch (error) {
      restoring = false;
      throw error;
    }
  });
'''
replace("desktop/main.mjs", '\n  handle("academy:print:html", (payload) => printHtmlDocument(payload));', restore_handler + '\n  handle("academy:print:html", (payload) => printHtmlDocument(payload));')

# Preload and TypeScript contract for same-device automatic recovery.
replace(
    "desktop/preload.cjs",
    '''  backup: Object.freeze({
    create: (request) => invoke("academy:backup:create", validatedBackupRequest(request)),
    restore: (request) => invoke("academy:backup:restore", validatedBackupRequest(request)),
  }),''',
    '''  backup: Object.freeze({
    create: (request) => invoke("academy:backup:create", validatedBackupRequest(request)),
    restore: (request) => invoke("academy:backup:restore", validatedBackupRequest(request)),
    restoreLatestAutomatic: () => invoke("academy:backup:restore-latest-automatic"),
  }),''',
)
replace(
    "src/desktop.d.ts",
    '''  backup: {
    create(request: { passphrase: string }): Promise<{ cancelled: boolean; path?: string }>;
    restore(request: { passphrase: string }): Promise<{ cancelled: boolean; restarting?: boolean; safetyBackup?: string }>;
  };''',
    '''  backup: {
    create(request: { passphrase: string }): Promise<{ cancelled: boolean; path?: string }>;
    restore(request: { passphrase: string }): Promise<{ cancelled: boolean; restarting?: boolean; safetyBackup?: string }>;
    restoreLatestAutomatic(): Promise<{ cancelled: boolean; restarting?: boolean; source?: string; safetyBackup?: string }>;
  };''',
)

# Backup screen: explicit recovery path for encrypted local daily copies.
restore_fn = '''
  async function restoreLatestAutomaticBackup() {
    if (!desktopApi) return;
    if (!confirm("سيتم استبدال البيانات الحالية بآخر نسخة تلقائية مشفرة محفوظة على هذا الجهاز ثم إعادة تشغيل البرنامج. هل تريد المتابعة؟")) {
      return;
    }
    setRestoring(true);
    setMessage(null);
    setError(null);
    try {
      await desktopApi.backup.restoreLatestAutomatic();
      setMessage("تمت استعادة آخر نسخة تلقائية. جارٍ إعادة تشغيل البرنامج…");
    } catch (e) {
      setRestoring(false);
      setError((e as Error).message || "تعذر استعادة النسخة التلقائية.");
    }
  }
'''
replace("src/routes/backup.tsx", "\n  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {", restore_fn + "\n  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {")
replace(
    "src/routes/backup.tsx",
    '''          <div className="mt-5">
            <Button
              variant="secondary"
              onClick={() => {
                if (desktopApi) void restoreDesktopBackup();
                else inputRef.current?.click();
              }}
              disabled={!canRestore || restoring}
            >
              {restoring ? "جارٍ الاستعادة..." : "اختيار ملف واستعادة"}
            </Button>
          </div>''',
    '''          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (desktopApi) void restoreDesktopBackup();
                else inputRef.current?.click();
              }}
              disabled={!canRestore || restoring}
            >
              {restoring ? "جارٍ الاستعادة..." : "اختيار ملف واستعادة"}
            </Button>
            {desktopApi ? (
              <Button variant="ghost" onClick={() => void restoreLatestAutomaticBackup()} disabled={!canRestore || restoring}>
                استعادة آخر نسخة تلقائية محلية
              </Button>
            ) : null}
          </div>
          {desktopApi ? (
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              النسخة التلقائية اليومية مشفرة بمفتاح يحميه Windows وتُستعاد من نفس مستخدم Windows على هذا الجهاز. للنقل إلى جهاز جديد استخدم النسخة اليدوية وكلمة حمايتها.
            </p>
          ) : null}''',
)
replace(
    "src/routes/backup.tsx",
    'النسخ اليدوية الجديدة محمية بكلمة مرور وقابلة للنقل بين الأجهزة. التحديثات لا تمسح البيانات أو الترخيص، ويستمر البرنامج بإنشاء نسخة أمان محلية تلقائية يومية.',
    'النسخ اليدوية الجديدة محمية بكلمة مرور وقابلة للنقل بين الأجهزة. النسخ اليومية التلقائية محمية أيضًا بمفتاح Windows المحلي ويمكن استعادتها من نفس الجهاز. التحديثات لا تمسح البيانات أو الترخيص.',
)

# Integration test: automatic backup must be encrypted and recoverable on the same device secret.
replace(
    "tests/protected-backup-harness.mjs",
    '  const service = new ProtectedBackupService({ database, backupDirectory });',
    '  const service = new ProtectedBackupService({ database, backupDirectory, automaticPassphrase: "Device-Automatic-Secret-123456789" });',
)
replace(
    "tests/protected-backup-harness.mjs",
    '''  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "legacy SQLite backup remains restorable");

  console.log("protected-backup-harness: OK");''',
    '''  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "legacy SQLite backup remains restorable");

  database.setMeta("last_auto_backup_at", null);
  const automatic = await service.createAutomaticIfDue();
  assert.ok(automatic?.endsWith(".ahbackup"), "automatic backup must use encrypted .ahbackup format");
  const automaticBytes = await readFile(automatic);
  assert.equal(automaticBytes.subarray(0, 5).toString("ascii"), "AHBK2");
  assert.equal(automaticBytes.includes(Buffer.from("SQLite format 3\\0")), false, "automatic backup must hide SQLite header");
  assert.equal(automaticBytes.includes(Buffer.from("طالب محمي", "utf8")), false, "automatic backup must hide student data");

  database.saveSnapshot({ ...snapshot, students: [] });
  const automaticRestore = await service.restoreLatestAutomatic();
  assert.equal(automaticRestore.source, automatic);
  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "automatic backup must restore on same device secret");

  console.log("protected-backup-harness: OK");''',
)

# Guide and illustrated help asset.
replace(
    "src/components/HelpGuide.tsx",
    'قاعدة SQLite الحية داخل Desktop ما زالت تحتاج تشفير at-rest حقيقي قبل إصدار EXE النهائي؛ النسخ اليدوية فقط أصبحت مشفرة الآن.',
    'قاعدة SQLite الحية داخل Desktop ما زالت تحتاج تشفير at-rest حقيقي قبل إصدار EXE النهائي؛ النسخ اليدوية واليومية أصبحت مشفرة، واليومية تُستعاد من نفس جهاز Windows، لكن ملف قاعدة العمل الحي نفسه ليس SQLCipher بعد.',
)
replace(
    "src/components/HelpGuide.tsx",
    'caption: "Windows: اختر كلمة حماية ← أنشئ ملف .ahbackup مشفر ← احفظ الملف والكلمة في مكانين منفصلين.",',
    'caption: "Windows: النسخة اليدوية .ahbackup محمولة بكلمة حماية، والنسخة اليومية مشفرة تلقائيًا للاستعادة المحلية على نفس الجهاز.",',
)
replace(
    "src/components/HelpGuide.tsx",
    '''      { title: "استعد النسخة", text: "أدخل كلمة الحماية ثم اختر ملف .ahbackup. النظام يفك النسخة مؤقتًا، يفحص سلامة SQLite والعلاقات المالية، ثم يستبدل البيانات ويعيد التشغيل.", action: "اختيار ملف واستعادة", result: "تعود البيانات بعد اجتياز فحوص السلامة." },''',
    '''      { title: "استعد النسخة", text: "للنسخة اليدوية أدخل كلمة الحماية واختر ملف .ahbackup. وللنسخة اليومية المحلية استخدم «استعادة آخر نسخة تلقائية محلية» بدون معرفة المفتاح الداخلي.", action: "اختيار ملف واستعادة / آخر نسخة تلقائية", result: "تعود البيانات بعد اجتياز فحوص السلامة." },''',
)

p = Path("public/help/05-admin-backup.svg")
text = p.read_text()
for old, new in [
    ("نسخة ahbackup محمية بكلمة مرور", "نسخ يدوية ويومية مشفرة + صلاحيات وتدقيق"),
    ("ملف .ahbackup + كلمة حماية", "يدوي محمول + يومي محلي مشفر"),
    ("أنشئ ← انقل ← استعد", "يدوي للنقل · يومي للاستعادة"),
    ("على جهاز جديد بنفس الكلمة", "اليومي لنفس الجهاز · اليدوي للنقل"),
]:
    if old not in text:
        raise SystemExit(f"missing svg marker: {old}")
    text = text.replace(old, new, 1)
p.write_text(text)

print("apply-auto-backup-encryption: source updates prepared")
