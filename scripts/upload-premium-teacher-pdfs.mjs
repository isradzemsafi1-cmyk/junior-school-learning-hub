import { readdir, readFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = "teacher-premium";
const headers = { apikey: key, Authorization: `Bearer ${key}` };

if (!url || !key) {
  console.error("Missing Supabase credentials. Start this migration with START-PREMIUM-PDF-UPLOAD.bat.");
  process.exit(1);
}

async function ensurePrivateBucket() {
  const check = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
  if (check.status === 404) {
    const create = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 20000000, allowed_mime_types: ["application/pdf"] })
    });
    if (!create.ok && create.status !== 409) throw new Error(`Could not create private bucket: ${await create.text()}`);
  } else if (!check.ok) {
    throw new Error(`Could not inspect storage bucket: ${await check.text()}`);
  } else {
    const details = await check.json();
    if (details.public === true) {
      const update = await fetch(`${url}/storage/v1/bucket/${bucket}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ public: false })
      });
      if (!update.ok) throw new Error(`Could not make bucket private: ${await update.text()}`);
    }
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
}

function encodedObjectPath(objectPath) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

async function uploadAndVerify(file, grade, catalogByRelativePath) {
  const relative = path.relative(path.join(root, `grade${grade}-teacher-resources`), file).split(path.sep).join("/");
  const catalogItem = catalogByRelativePath.get(`${grade}/${relative}`);
  const objectPath = catalogItem?.storage_path || `grade${grade}/${relative}`;
  const bytes = await readFile(file);
  const objectUrl = `${url}/storage/v1/object/${bucket}/${encodedObjectPath(objectPath)}`;
  const uploaded = await fetch(objectUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: bytes
  });
  if (!uploaded.ok) throw new Error(`Upload failed for ${objectPath}: ${await uploaded.text()}`);

  const verify = await fetch(objectUrl, { headers });
  if (!verify.ok) throw new Error(`Verification failed for ${objectPath}: HTTP ${verify.status}`);
  const remoteBytes = Buffer.from(await verify.arrayBuffer());
  if (remoteBytes.length !== bytes.length) throw new Error(`Size verification failed for ${objectPath}: local ${bytes.length}, remote ${remoteBytes.length}`);
  return { file, grade, relative, objectPath, bytes: bytes.length };
}

async function moveToBackup(uploaded) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(path.dirname(root), `${path.basename(root)}-premium-pdf-backup-${stamp}`);
  const moved = [];
  try {
    for (const item of uploaded) {
      const gradeFolder = path.join(backupRoot, `grade${item.grade}-teacher-resources`, path.dirname(item.relative));
      await mkdir(gradeFolder, { recursive: true });
      const backupFile = path.join(gradeFolder, path.basename(item.relative));
      await rename(item.file, backupFile);
      moved.push({ original: item.file, backup: backupFile });
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      await mkdir(path.dirname(item.original), { recursive: true });
      await rename(item.backup, item.original).catch(() => {});
    }
    throw new Error(`PDF backup move failed; original files were restored where possible. ${error.message}`);
  }
  await (await import("node:fs/promises")).writeFile(
    path.join(backupRoot, "UPLOAD-MANIFEST.json"),
    JSON.stringify(uploaded.map(({ grade, relative, objectPath, bytes }) => ({ grade, relative, objectPath, bytes })), null, 2)
  );
  return backupRoot;
}

async function main() {
  const catalog = JSON.parse(await readFile(path.join(root, "netlify/lib/teacher-catalog.json"), "utf8"));
  const catalogByRelativePath = new Map();
  for (const grade of ["8", "9"]) {
    for (const item of catalog[grade] || []) {
      const key = `${grade}/${String(item.path).replaceAll("\\", "/")}`;
      catalogByRelativePath.set(key, item);
      const localFile = path.join(root, `grade${grade}-teacher-resources`, ...item.path.split(/[\\/]/));
      try { await stat(localFile); } catch { throw new Error(`Catalogued PDF is missing: ${localFile}`); }
      if (item.storage_path !== `grade${grade}/${String(item.path).replaceAll("\\", "/")}`) {
        throw new Error(`Catalogue storage path mismatch for ${item.path}`);
      }
    }
  }

  await ensurePrivateBucket();
  const allFiles = [];
  for (const grade of [8, 9]) {
    const dir = path.join(root, `grade${grade}-teacher-resources`);
    allFiles.push(...(await walk(dir)).map(file => ({ file, grade })));
  }
  if (!allFiles.length) throw new Error("No Grade 8 or Grade 9 PDFs were found.");

  console.log(`Found ${allFiles.length} PDFs. Uploading and verifying each one...`);
  const uploaded = [];
  for (let i = 0; i < allFiles.length; i++) {
    const item = await uploadAndVerify(allFiles[i].file, allFiles[i].grade, catalogByRelativePath);
    uploaded.push(item);
    console.log(`[${i + 1}/${allFiles.length}] Verified ${item.objectPath}`);
  }

  console.log(`All ${uploaded.length} PDFs uploaded and byte-size verified.`);
  const backupRoot = await moveToBackup(uploaded);
  console.log("The local PDFs have been moved out of the deployable project, not permanently deleted.");
  console.log(`Original PDF backup: ${backupRoot}`);
  console.log("PRIVATE PDF MIGRATION COMPLETED SUCCESSFULLY.");
}

main().catch(error => {
  console.error(`\nMIGRATION STOPPED: ${error.message}`);
  console.error("No local PDF files were moved unless all uploads and verification completed.");
  process.exit(1);
});
