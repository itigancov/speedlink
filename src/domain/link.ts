import type { Result } from './result';

export type LinkError = 'empty' | 'non-web-scheme' | 'unparseable';

/** `scheme://…`: parsed as given. Needed because the URL parser reads `localhost:3000` as scheme `localhost:`. */
const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/**
 * `scheme:` not followed by a port (`mailto:`, `javascript:`, `about:`): a non-web link typed without `//`.
 * Without this, `mailto:me@example.com` would parse after the `https://` prefix as credentials on example.com.
 * A digits-only tail (`about:0`) reads as host and port and becomes a plain https link, which is harmless.
 */
const OPAQUE_SCHEME = /^[a-z][a-z0-9+.-]*:(?![0-9]*(?:[/?#]|$))/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** localhost, an IPv4 address or a bracketed IPv6 address. */
function isLoopbackOrIp(host: string): boolean {
  return host === 'localhost' || IPV4.test(host) || host.startsWith('[');
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return isLoopbackOrIp(h) || h.endsWith('.local');
}

/** The host of scheme-less input: before any path, query or fragment, without credentials and port. */
function bareHost(input: string): string {
  const authority = input.split(/[/?#]/, 1)[0] ?? '';
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  if (hostPort.startsWith('[')) return hostPort.slice(0, hostPort.indexOf(']') + 1) || hostPort;
  return hostPort.replace(/:\d*$/, '');
}

/** The parsed URL when it is an http(s) URL, else null. */
export function parseWebUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Normalizes user input to an http(s) link, adding `http://` for local hosts and `https://` otherwise. */
export function normalizeLink(input: string): Result<string, LinkError> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  let candidate: string;
  if (EXPLICIT_SCHEME.test(trimmed)) candidate = trimmed;
  else if (OPAQUE_SCHEME.test(trimmed)) return { ok: false, error: 'non-web-scheme' };
  else candidate = `${isLocalHost(bareHost(trimmed)) ? 'http' : 'https'}://${trimmed}`;

  if (!URL.canParse(candidate)) return { ok: false, error: 'unparseable' };
  const url = parseWebUrl(candidate);
  if (url === null) return { ok: false, error: 'non-web-scheme' };
  return { ok: true, value: url.toString() };
}

/** The hostname without one leading `www.` (`www2.` is kept). */
export function stripWww(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

/** Hostname without one leading `www.`, plus `:port` when it isn't the scheme default. IDN hosts stay punycode. */
export function siteOf(link: string): string {
  const url = new URL(link);
  const host = stripWww(url.hostname);
  return url.port === '' ? host : `${host}:${url.port}`;
}

/** An http(s) link as the popup shows it, without `https://` or `http://`; any other URL is shown whole. */
export function withoutScheme(link: string): string {
  return link.replace(/^https?:\/\//i, '');
}

/** Second-level labels that, under a two-letter country TLD, act as part of the suffix (`co.uk`, `com.au`). */
const COUNTRY_SECOND_LEVELS: ReadonlySet<string> = new Set([
  'co',
  'com',
  'net',
  'org',
  'gov',
  'edu',
  'ac',
  'or',
  'ne',
  'go',
]);

/**
 * The label that names the site: `docs.google.com` → google, `bbc.co.uk` → bbc, `foo.github.io` → github.
 *
 * A deliberate heuristic instead of the Public Suffix List: take the label before the TLD, or the one before
 * that when the TLD is a two-letter country code and the second level is a common generic one (`co.uk`).
 * It misreads some private suffixes (`foo.github.io` gives github, not foo), which suits a memorable mark.
 * localhost and IP addresses are returned whole.
 */
export function mainLabel(link: string): string {
  const host = stripWww(new URL(link).hostname);
  if (isLoopbackOrIp(host)) return host;
  const labels = host.split('.');
  const n = labels.length;
  if (n === 1) return host;
  const tld = labels[n - 1] ?? '';
  const second = labels[n - 2] ?? '';
  if (n >= 3 && tld.length === 2 && COUNTRY_SECOND_LEVELS.has(second)) return labels[n - 3] ?? second;
  return second;
}
