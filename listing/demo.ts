// The demo keymap and the sites around it. Real names and links, shown as monograms; every request is answered by a
// stub, so nothing reaches the live web.

interface DemoShortcut {
  key: string;
  name: string;
  link: string;
  openMode: 'smart' | 'new' | 'this' | 'bg';
  tabMatch: 'exact' | 'page' | 'site';
  /** Left open in a background tab, so its key shows the Open now dot. */
  open?: true;
}

export const DEMO_KEYMAP: DemoShortcut[] = [
  { key: 'G', name: 'GitHub', link: 'https://github.com/', openMode: 'smart', tabMatch: 'site', open: true },
  { key: 'M', name: 'Gmail', link: 'https://mail.google.com/mail/u/0/', openMode: 'smart', tabMatch: 'site' },
  { key: 'Y', name: 'YouTube', link: 'https://www.youtube.com/', openMode: 'new', tabMatch: 'site', open: true },
  { key: 'N', name: 'Notion', link: 'https://www.notion.so/', openMode: 'smart', tabMatch: 'page', open: true },
  { key: 'C', name: 'Calendar', link: 'https://calendar.google.com/', openMode: 'smart', tabMatch: 'site' },
  { key: 'F', name: 'Figma', link: 'https://www.figma.com/files/', openMode: 'smart', tabMatch: 'site', open: true },
  { key: 'L', name: 'Slack', link: 'https://app.slack.com/client/', openMode: 'smart', tabMatch: 'site' },
  { key: 'D', name: 'Docs', link: 'https://docs.google.com/document/', openMode: 'smart', tabMatch: 'exact' },
  { key: 'P', name: 'Maps', link: 'https://www.google.com/maps', openMode: 'new', tabMatch: 'site' },
  { key: 'H', name: 'Hacker News', link: 'https://news.ycombinator.com/', openMode: 'this', tabMatch: 'site' },
  { key: 'W', name: 'Wikipedia', link: 'https://en.wikipedia.org/', openMode: 'bg', tabMatch: 'site' },
];

/** The neutral article page behind every overlay and toast, under a reserved `.example` domain. */
export const BACKDROP_URL = 'https://notes.example/journal/river-path';
