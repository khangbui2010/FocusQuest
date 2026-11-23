/**
 * Date utility functions for Focus Quest.
 * Ensures consistent local timezone date keys ('YYYY-MM-DD')
 * preventing premature or delayed daily stats shifts.
 */

export function getLocalDateKey(dateInput: Date | number = new Date()): string {
  const d = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
