// The logo mark and the SpeedLink name: the left end of the Options and Welcome header strips.
import { ZapIcon } from 'lucide-react';

/** The logo mark alone. The listing script draws the extension icons and the promo tile from it. */
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      data-slot="brand-mark"
      className="flex size-8 items-center justify-center rounded-lg bg-primary"
    >
      <ZapIcon className="size-4 fill-primary-foreground text-primary-foreground" />
    </span>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <span className="font-bold text-lg">{i18n.t('extName')}</span>
    </div>
  );
}
