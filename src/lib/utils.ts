import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The names added in tailwind.config.js. Without them a size such as `text-footnote`
// would be read as a colour and silently remove `text-foreground` beside it.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'title-1', 'title-2', 'headline', 'body', 'body-ar', 'callout', 'label', 'footnote', 'caption', 'micro'] }],
    },
    theme: { borderRadius: ['beak'] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
