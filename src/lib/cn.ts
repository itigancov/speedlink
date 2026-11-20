// The class merger every component uses. The stock `cn` reads `text-ui` (our 13 px step in tokens.css) as a text
// colour, so it would drop the colour class next to it; the other custom steps (`3xs`, `2xs`, `md`) already read as
// font sizes.
import { createCn } from 'cn/config';

export const cn = createCn({ extend: { classGroups: { 'font-size': [{ text: ['ui'] }] } } });
