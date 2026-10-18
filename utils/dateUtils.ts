/**
 * Date utilities that ensure consistent local date handling across the app
 * Always uses the phone's local timezone, never UTC conversions
 */

/**
 * Gets today's date in YYYY-MM-DD format using phone's local timezone
 */
export const getTodayLocal = (): string => {
  return new Date().toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
};

/**
 * Gets date in YYYY-MM-DD format using phone's local timezone
 */
export const getLocalDateString = (date: Date): string => {
  return date.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
};

/**
 * Creates a date object from YYYY-MM-DD string in local timezone
 */
export const parseLocalDateString = (dateString: string): Date => {
  // Create date in local timezone, not UTC
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

/**
 * Checks if two date strings represent the same local date
 */
export const isSameLocalDate = (date1: string, date2: string): boolean => {
  return date1 === date2;
};

/**
 * Gets current time in HH:MM format using phone's local timezone
 */
export const getCurrentLocalTime = (): string => {
  const now = new Date();
  return now.toTimeString().slice(0, 5); // HH:MM format
};

/**
 * Debug function to log timezone information
 */
export const logTimezoneInfo = () => {
  const now = new Date();
  console.log('=== TIMEZONE DEBUG INFO ===');
  console.log('Local Date (en-CA):', now.toLocaleDateString('en-CA'));
  console.log('Local Time:', now.toTimeString().slice(0, 8));
  console.log('Timezone Offset (minutes):', now.getTimezoneOffset());
  console.log('ISO String:', now.toISOString());
  console.log('Local String:', now.toString());
  console.log('=========================');
};