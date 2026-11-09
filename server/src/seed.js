import bcrypt from 'bcryptjs';
import { User, Staff } from './models/index.js';
import { generateCode } from './lib/code.js';
import { config } from './config.js';

export async function seedAdmin() {
  if ((await Staff.estimatedDocumentCount()) > 0) return;
  await Staff.create({
    username: config.adminUsername,
    name: 'Administrator',
    role: 'admin',
    passwordHash: await bcrypt.hash(config.adminPassword, 10),
  });
  console.log(`[seed] created admin staff "${config.adminUsername}"`);
  if (config.adminPassword === 'admin123') console.warn('[seed] WARNING: default admin password in use — change ADMIN_PASSWORD');
}

const FIRST = ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Sneha', 'Arjun', 'Kavya', 'Rahul', 'Isha', 'Liam', 'Emma', 'Noah', 'Olivia', 'Mateo', 'Sofia', 'Yuki', 'Chen', 'Fatima', 'Omar'];
const LAST = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Das', 'Mehta', 'Smith', 'Garcia', 'Kim', 'Nguyen', 'Khan', 'Silva', 'Tanaka', 'Müller', 'Rossi', 'Brown'];
const ORGS = ['', '', 'Acme Corp', 'Globex', 'Initech', 'Umbrella Labs', 'Stark Industries', 'Wayne Enterprises', 'City College', 'Freelance'];

/** Insert `n` fake users directly via the model. Returns the number inserted. */
export async function seedFakeUsers(n, { batchSize = 1000 } = {}) {
  const runTag = Date.now().toString(36).slice(-4);
  const phoneBase = 9_000_000_000 + (Date.now() % 900_000) * 1000;
  let inserted = 0;
  for (let start = 0; start < n; start += batchSize) {
    const docs = [];
    for (let i = start; i < Math.min(n, start + batchSize); i++) {
      const first = FIRST[i % FIRST.length];
      const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
      docs.push({
        code: generateCode(),
        fullName: `${first} ${last}`,
        email: `${first}.${last}.${runTag}${i}@example.com`.toLowerCase(),
        phone: String(phoneBase + i),
        organization: ORGS[i % ORGS.length],
        status: 'active',
      });
    }
    try {
      const res = await User.insertMany(docs, { ordered: false });
      inserted += res.length;
    } catch (err) {
      // ordered:false — keep the ones that went in (rare code/phone collisions are skipped)
      inserted += err.insertedDocs?.length ?? err.result?.insertedCount ?? 0;
      if (err.code !== 11000 && !err.writeErrors) throw err;
    }
  }
  return inserted;
}
