// The logo mark and the SpeedLink name: the left end of the Options and Welcome header strips.
import { ZapIcon } from 'lucide-react';

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-primary">
        <ZapIcon className="size-4 fill-primary-foreground text-primary-foreground" />
      </span>
      <span className="font-bold text-lg">{i18n.t('extName')}</span>
    </div>
  );
}
