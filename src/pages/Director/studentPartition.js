/**
 * Partitions student records into mutually exclusive active and pending lists.
 * Guarantees that:
 * 1. An active student (status === 'active') is never placed in the pending list.
 * 2. A pending student (status === 'pending_approval') is never placed in the active list.
 * 3. Overlapping or duplicate records for the same student (by email or id) are deduplicated,
 *    with active status strictly taking precedence over pending.
 * 4. Status values with whitespace or mixed casing are safely normalized.
 */
export function partitionStudentRecords(rawList) {
  if (!Array.isArray(rawList)) return { pendingList: [], activeList: [] };

  const sorted = [...rawList].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // 1. Strict Active list: status must be exactly 'active'
  const activeList = [];
  const activeIds = new Set();
  const activeUids = new Set();
  const activeEmails = new Set();

  for (const s of sorted) {
    const status = (s.status || '').trim().toLowerCase();
    if (status === 'active') {
      const id = s.id ? String(s.id).trim() : '';
      const uid = s.uid ? String(s.uid).trim() : '';
      const email = s.email ? String(s.email).trim().toLowerCase() : '';

      // Check if this active record is a duplicate of an already processed active student
      const isDuplicate = (email && activeEmails.has(email)) ||
                          (id && activeIds.has(id)) ||
                          (uid && activeUids.has(uid));

      // Always register identity fields of active records
      if (id) activeIds.add(id);
      if (uid) activeUids.add(uid);
      if (email) activeEmails.add(email);

      if (!isDuplicate) {
        activeList.push(s);
      }
    }
  }

  // 2. Strict Pending list: status must be exactly 'pending_approval'
  // Overlap prevention: any student already in active list is strictly excluded
  const pendingList = [];
  const seenPendingIds = new Set();
  const seenPendingUids = new Set();
  const seenPendingEmails = new Set();

  for (const s of sorted) {
    const status = (s.status || '').trim().toLowerCase();
    if (status === 'pending_approval') {
      const id = s.id ? String(s.id).trim() : '';
      const uid = s.uid ? String(s.uid).trim() : '';
      const email = s.email ? String(s.email).trim().toLowerCase() : '';

      // If this student already has an active status, exclude from pending
      const isAlreadyActive = (email && activeEmails.has(email)) ||
                              (id && activeIds.has(id)) ||
                              (uid && activeUids.has(uid));

      if (isAlreadyActive) {
        continue;
      }

      // Deduplicate pending records for the same student
      const isDuplicatePending = (email && seenPendingEmails.has(email)) ||
                                 (id && seenPendingIds.has(id)) ||
                                 (uid && seenPendingUids.has(uid));

      if (id) seenPendingIds.add(id);
      if (uid) seenPendingUids.add(uid);
      if (email) seenPendingEmails.add(email);

      if (!isDuplicatePending) {
        pendingList.push(s);
      }
    }
  }

  return { pendingList, activeList };
}
