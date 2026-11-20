import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('keeps a text colour next to the ui font size', () => {
    expect(cn('bg-primary text-primary-foreground', 'text-ui')).toBe('bg-primary text-primary-foreground text-ui');
  });

  it('lets a later font size replace text-ui, and text-ui replace an earlier one', () => {
    expect(cn('text-ui', 'text-sm')).toBe('text-sm');
    expect(cn('text-sm', 'text-ui')).toBe('text-ui');
  });
});
