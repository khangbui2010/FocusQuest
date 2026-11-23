/**
 * Focus Profiles and Allowlist types
 */

export interface FocusProfile {
  id: string;               // Unique profile ID (e.g. 'study-research', 'deep-work-coding')
  name: string;             // Human readable name ('Study & Research', 'Deep Work / Coding')
  allowedDomains: string[]; // List of allowed domains (e.g. ['wikipedia.org', '*.github.com'])
  isDefault?: boolean;      // Whether this profile is selected by default
  createdAt: number;        // Timestamp
  updatedAt: number;        // Timestamp
}
