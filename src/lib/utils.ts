import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['micro', 'caption', 'label', 'metadata', 'body', 'lead', 'heading', 'title', 'display'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
