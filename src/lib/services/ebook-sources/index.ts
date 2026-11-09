/**
 * Component: E-book Sources Index
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Exports all ebook source implementations
 */

export { EbookSource, EbookSearchParams, EbookSearchResult, EbookDownloadResult } from './base';
export { ebookSourceRegistry, EbookSourceRegistry } from './registry';
export { LibGenSource } from './libgen';
export { ZLibrarySource } from './zlib';
export { OceanofPDFSource } from './oceanofpdf';
export { WelibSource } from './welib';
