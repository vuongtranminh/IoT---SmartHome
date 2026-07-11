// Utility functions
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// cn = className helper — merge Tailwind classes an toàn
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
