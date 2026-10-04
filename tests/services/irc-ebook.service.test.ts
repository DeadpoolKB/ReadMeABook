import {
  parseDccSendOffer,
  parseIrcEbookResults,
} from '@/lib/services/irc-ebook.service';

describe('IRC ebook service', () => {
  it('parses ebook results and excludes audiobook-marked entries', () => {
    expect(parseIrcEbookResults([
      '!BookBot A. Writer - Example Book.epub ::INFO:: 2.5MB',
      '!BookBot A. Writer - Audio Edition.m4b ::INFO:: 100MB',
      '!BookBot A. Writer - Another Book.unknown ::INFO:: 1MB',
    ].join('\n'))).toMatchObject([
      {
        title: 'A. Writer - Example Book',
        format: 'epub',
        size: Math.round(2.5 * 1024 * 1024),
        source: 'irc',
        downloadUrl: '!BookBot A. Writer - Example Book.epub ::INFO:: 2.5MB',
      },
    ]);
  });

  it('parses valid DCC offers and rejects unsafe endpoints or filenames', () => {
    expect(parseDccSendOffer('\x01DCC SEND "example.epub" 134744072 12345 4096\x01')).toMatchObject({
      filename: 'example.epub',
      host: '8.8.8.8',
      port: 12345,
      size: 4096,
    });
    expect(parseDccSendOffer('\x01DCC SEND "example.epub" 2130706433 12345 4096\x01')).toBeNull();
    expect(parseDccSendOffer('\x01DCC SEND "../secret.epub" 134744072 12345 4096\x01')).toBeNull();
  });
});
