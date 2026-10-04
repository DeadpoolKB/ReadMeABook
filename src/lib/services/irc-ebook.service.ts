import { once } from 'node:events';
import { isIPv4 } from 'node:net';
import net from 'node:net';
import tls from 'node:tls';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import { getConfigService } from './config.service';

const EBOOK_FORMATS = new Set([
  'epub', 'mobi', 'azw', 'azw3', 'pdf', 'doc', 'docx', 'html', 'htm',
  'rtf', 'txt', 'lit', 'fb2', 'djvu', 'cbr', 'cbz', 'cdr', 'jpg',
]);
const DCC_TIMEOUT_MS = 10 * 60 * 1000;
const SEARCH_RESULTS_MAX_BYTES = 100 * 1024 * 1024;
const RELEASE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

interface IrcSettings {
  server: string;
  port: number;
  useTls: boolean;
  channel: string;
  nick: string;
  searchBot: string;
}

interface DccOffer {
  filename: string;
  host: string;
  port: number;
  size: number;
}

export interface IrcEbookRelease {
  guid: string;
  title: string;
  size: number;
  seeders: number;
  indexer: string;
  publishDate: Date;
  downloadUrl: string;
  score: number;
  finalScore: number;
  source: 'irc';
  format: string;
}

class IrcLineReader {
  private buffer = '';
  private lines: string[] = [];
  private waiters: Array<(line: string) => void> = [];
  private failure: Error | null = null;

  constructor(private readonly socket: net.Socket | tls.TLSSocket) {
    socket.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf8');
      const ready = this.buffer.split('\r\n');
      this.buffer = ready.pop() || '';
      for (const line of ready) {
        const waiter = this.waiters.shift();
        if (waiter) waiter(line);
        else this.lines.push(line);
      }
    });
    socket.on('error', (error) => {
      this.failure = error;
      this.waiters.splice(0).forEach((waiter) => waiter(''));
    });
    socket.on('close', () => {
      if (!this.failure) this.failure = new Error('IRC connection closed');
      this.waiters.splice(0).forEach((waiter) => waiter(''));
    });
  }

  async next(timeoutMs: number): Promise<string> {
    if (this.failure) throw this.failure;
    const line = this.lines.shift();
    if (line !== undefined) return line;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== onLine);
        reject(new Error('Timed out waiting for IRC response'));
      }, timeoutMs);
      const onLine = (value: string) => {
        clearTimeout(timer);
        if (this.failure) reject(this.failure);
        else resolve(value);
      };
      this.waiters.push(onLine);
    });
  }
}

export function parseDccSendOffer(line: string): DccOffer | null {
  const match = line.match(/\x01DCC SEND (?:"([^"]+)"|(\S+)) (\d+) (\d+) (\d+)\x01/i);
  if (!match) return null;
  const filename = match[1] || match[2];
  const ipValue = Number(match[3]);
  const port = Number(match[4]);
  const size = Number(match[5]);
  if (!filename || /[\\/]/.test(filename) || filename === '.' || filename === '..') return null;
  if (!Number.isSafeInteger(ipValue) || ipValue < 1 || ipValue > 0xffffffff) return null;
  const host = [24, 16, 8, 0].map((shift) => (ipValue >>> shift) & 255).join('.');
  if (!isPublicIpv4(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!Number.isSafeInteger(size) || size < 1 || size > RELEASE_MAX_BYTES) return null;
  return { filename, host, port, size };
}

function isPublicIpv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 192 && b === 88 && Number(host.split('.')[2]) === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && Number(host.split('.')[2]) === 100))) ||
    (a === 203 && b === 0 && Number(host.split('.')[2]) === 113)
  );
}

function formatSizeBytes(value: string | undefined): number {
  const match = value?.match(/^([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || 'b').toLowerCase();
  const multiplier = unit.startsWith('g') ? 1024 ** 3
    : unit.startsWith('m') ? 1024 ** 2
      : unit.startsWith('k') ? 1024 : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : 0;
}

export function parseIrcEbookResults(contents: string): IrcEbookRelease[] {
  const releases: IrcEbookRelease[] = [];
  for (const line of contents.split(/\r?\n/)) {
    const match = line.trim().match(/^!(\S+)\s+(.+?)\s+-\s+(.+?)\.([a-z0-9]+)\b(?:\s+::INFO::\s*(.+?))?(?:\s+::HASH::\s*\S+)?$/i);
    if (!match || !EBOOK_FORMATS.has(match[4].toLowerCase())) continue;
    const [, server, author, title, format, sizeText] = match;
    if (/\b(?:audiobooks?|unabridged|abridged|narrat(?:ed|or)|audible)\b/i.test(line)) continue;
    releases.push({
      guid: `irc-${Buffer.from(line).toString('base64url')}`,
      title: `${author.trim()} - ${title.trim()}`,
      size: formatSizeBytes(sizeText),
      seeders: 0,
      indexer: `IRC:${server}`,
      publishDate: new Date(),
      downloadUrl: line.trim(),
      score: 100,
      finalScore: 100,
      source: 'irc',
      format: format.toLowerCase(),
    });
  }
  return releases;
}

async function createConnection(settings: IrcSettings): Promise<{
  socket: net.Socket | tls.TLSSocket;
  reader: IrcLineReader;
}> {
  const socket = settings.useTls
    ? tls.connect({ host: settings.server, port: settings.port, servername: settings.server })
    : net.connect({ host: settings.server, port: settings.port });
  socket.setTimeout(120_000);
  socket.on('timeout', () => socket.destroy(new Error('IRC connection timed out')));
  let connectTimer: NodeJS.Timeout | undefined;
  try {
      await Promise.race([
        once(socket, settings.useTls ? 'secureConnect' : 'connect'),
        new Promise((_, reject) => {
          connectTimer = setTimeout(() => reject(new Error('IRC connection timed out')), 15_000);
        }),
      ]);
  } finally {
    if (connectTimer) clearTimeout(connectTimer);
  }
  const reader = new IrcLineReader(socket);
  try {
    socket.write(`USER ${settings.nick} 0 * :ReadMeABook\r\nNICK ${settings.nick}\r\n`);
    let registered = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let line: string;
      try {
        line = await reader.next(3_000);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Timed out')) continue;
        throw error;
      }
      if (line.startsWith('PING ')) {
        socket.write(`PONG ${line.slice(5)}\r\n`);
      } else if (/ 001 /.test(line)) {
        registered = true;
        break;
      }
    }
    if (!registered) throw new Error('IRC registration timed out');
    socket.write(`JOIN #${settings.channel}\r\n`);
    return { socket, reader };
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function waitForChannelJoin(
  socket: net.Socket | tls.TLSSocket,
  reader: IrcLineReader,
): Promise<void> {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    let line: string;
    try {
      line = await reader.next(Math.min(5_000, end - Date.now()));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Timed out')) continue;
      throw error;
    }
    if (line.startsWith('PING ')) {
      socket.write(`PONG ${line.slice(5)}\r\n`);
      continue;
    }
    if (/ 366 /.test(line)) return;
    if (/ (?:403|471|473|474|475) /.test(line)) throw new Error(`Could not join IRC channel: ${line}`);
  }
  throw new Error('Timed out joining IRC channel');
}

async function waitForDcc(
  socket: net.Socket | tls.TLSSocket,
  reader: IrcLineReader,
  matches: (offer: DccOffer, line: string) => boolean,
  timeoutMs: number,
): Promise<DccOffer> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    let line: string;
    try {
      line = await reader.next(Math.min(5_000, end - Date.now()));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Timed out')) continue;
      throw error;
    }
    if (line.startsWith('PING ')) {
      socket.write(`PONG ${line.slice(5)}\r\n`);
      continue;
    }
    const offer = parseDccSendOffer(line);
    if (offer && matches(offer, line)) return offer;
    if (/:\s*(?:Sorry|No results|0 matches)/i.test(line)) throw new Error('IRC search returned no results');
  }
  throw new Error('Timed out waiting for an IRC DCC offer');
}

async function receiveDcc(offer: DccOffer, destination: string, maxBytes: number, onProgress?: (percent: number) => Promise<void> | void): Promise<void> {
  if (offer.size > maxBytes) throw new Error('IRC DCC transfer exceeds the allowed size');
  const socket = net.connect({ host: offer.host, port: offer.port });
  socket.setTimeout(DCC_TIMEOUT_MS);
  socket.on('timeout', () => socket.destroy(new Error('IRC DCC transfer timed out')));
  await once(socket, 'connect');
  let received = 0;
  let progress = -1;
  try {
    const file = await import('node:fs/promises').then(({ open }) => open(destination, 'w'));
    try {
      for await (const chunkValue of socket) {
        const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
        if (received + chunk.length > offer.size) throw new Error('IRC DCC sent more data than offered');
        await file.write(chunk);
        received += chunk.length;
        const nextProgress = Math.floor((received / offer.size) * 100);
        if (nextProgress !== progress) {
          progress = nextProgress;
          await onProgress?.(progress);
        }
        const ack = Buffer.alloc(4);
        ack.writeUInt32BE(received >>> 0);
        socket.write(ack);
        if (received === offer.size) break;
      }
    } finally {
      await file.close();
    }
    if (received !== offer.size) throw new Error(`IRC DCC transfer incomplete (${received}/${offer.size} bytes)`);
  } finally {
    socket.destroy();
  }
}

async function getSettings(): Promise<IrcSettings> {
  const config = getConfigService();
  const [server, port, useTls, channel, nick, searchBot] = await Promise.all([
    config.get('ebook_irc_server'),
    config.get('ebook_irc_port'),
    config.get('ebook_irc_tls'),
    config.get('ebook_irc_channel'),
    config.get('ebook_irc_nick'),
    config.get('ebook_irc_search_bot'),
  ]);
  if (!server || !channel || !nick || !searchBot) {
    throw new Error('Configure the IRC server, channel, nickname, and search bot in ebook settings');
  }
  const parsedPort = Number(port || '6697');
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('IRC port must be a number from 1 to 65535');
  }
  return { server, port: parsedPort, useTls: useTls !== 'false', channel: channel.replace(/^#/, ''), nick, searchBot };
}

export async function searchIrcEbooks(query: string): Promise<IrcEbookRelease[]> {
  const settings = await getSettings();
  const safeQuery = query.replace(/[\r\n\0-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!safeQuery) throw new Error('IRC search requires a non-empty query');
  const { socket, reader } = await createConnection(settings);
  try {
    await waitForChannelJoin(socket, reader);
    socket.write(`PRIVMSG #${settings.channel} :@${settings.searchBot} ${safeQuery}\r\n`);
    const offer = await waitForDcc(socket, reader, (_offer, line) => /_results_for/i.test(line), 60_000);
    if (offer.size > SEARCH_RESULTS_MAX_BYTES) throw new Error('IRC search results file is unexpectedly large');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rmab-irc-'));
    const resultPath = path.join(directory, 'results');
    try {
      await receiveDcc(offer, resultPath, SEARCH_RESULTS_MAX_BYTES);
      let contents = await readFile(resultPath, 'utf8');
      if (offer.filename.toLowerCase().endsWith('.zip')) {
        const zip = new AdmZip(await readFile(resultPath));
        const textFile = zip.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.txt'));
        if (!textFile) throw new Error('IRC search results archive contains no text file');
        contents = textFile.getData().toString('utf8');
      }
      return parseIrcEbookResults(contents);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } finally {
    socket.end('QUIT :ReadMeABook\r\n');
  }
}

export async function downloadIrcEbook(
  requestLine: string,
  targetPath: string,
  onProgress: (progress: number) => Promise<void> | void,
): Promise<void> {
  if (!requestLine.startsWith('!') || requestLine.length > 1000 || /[\r\n]/.test(requestLine)) {
    throw new Error('Invalid IRC release request');
  }
  const settings = await getSettings();
  const { socket, reader } = await createConnection(settings);
  try {
    const requestedBot = requestLine.slice(1).split(/\s+/, 1)[0];
    socket.write(`PRIVMSG #${settings.channel} :${requestLine}\r\n`);
    const offer = await waitForDcc(
      socket,
      reader,
      (_offer, line) => {
        const sender = line.match(/^:([^! ]+)/)?.[1];
        return !sender || sender.toLowerCase() === requestedBot.toLowerCase();
      },
      120_000,
    );
    try {
      await receiveDcc(offer, targetPath, RELEASE_MAX_BYTES, onProgress);
    } catch (error) {
      await rm(targetPath, { force: true });
      throw error;
    }
  } finally {
    socket.end('QUIT :ReadMeABook\r\n');
  }
}
