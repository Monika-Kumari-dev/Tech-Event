import { User } from './User.js';
import { Checkin } from './Checkin.js';
import { Device } from './Device.js';
import { Staff } from './Staff.js';
import { Batch } from './Batch.js';

export { User, Checkin, Device, Staff, Batch };

/** Build indexes before serving traffic (unique indexes back the 409 / idempotency logic). */
export async function initModels() {
  await Promise.all([User.init(), Checkin.init(), Device.init(), Staff.init(), Batch.init()]);
}
