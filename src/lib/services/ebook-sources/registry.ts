/**
 * Component: E-book Source Registry
 * Documentation: documentation/integrations/ebook-sidecar.md
 *
 * Registry for managing multiple ebook download sources
 * Handles source registration, priority ordering, and unified search
 */

import { RMABLogger } from '../../utils/logger';
import {
  EbookSource,
  EbookSearchParams,
  EbookSearchResult,
} from './base';

const logger = RMABLogger.create('EbookSourceRegistry');

/**
 * Registry for managing ebook sources
 */
class EbookSourceRegistry {
  private sources: Map<string, EbookSource> = new Map();

  /**
   * Register an ebook source
   */
  register(source: EbookSource): void {
    this.sources.set(source.id, source);
    logger.debug(`Registered ebook source: ${source.id} (${source.name})`);
  }

  /**
   * Unregister an ebook source
   */
  unregister(sourceId: string): void {
    this.sources.delete(sourceId);
    logger.debug(`Unregistered ebook source: ${sourceId}`);
  }

  /**
   * Get a specific source by ID
   */
  getSource(sourceId: string): EbookSource | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Get all registered sources
   */
  getAllSources(): EbookSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Get enabled sources sorted by priority
   */
  getEnabledSources(): EbookSource[] {
    return this.getAllSources()
      .filter(source => source.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Search across all enabled sources in parallel
   * Aggregates results from all sources
   */
  async searchAll(params: EbookSearchParams, logger?: RMABLogger): Promise<EbookSearchResult[]> {
    const enabledSources = this.getEnabledSources();

    if (enabledSources.length === 0) {
      logger?.warn('No ebook sources enabled');
      return [];
    }

    logger?.info(`Searching ${enabledSources.length} enabled ebook source(s) in parallel`);

    // Search all sources in parallel
    const searchPromises = enabledSources.map(source =>
      this.searchSingleSource(source, params, logger)
    );

    const results = await Promise.all(searchPromises);

    // Flatten and aggregate results
    const allResults = results.flat();

    logger?.info(`Found ${allResults.length} total results from ${enabledSources.length} source(s)`);

    return allResults;
  }

  /**
   * Search a single source with error handling
   */
  private async searchSingleSource(
    source: EbookSource,
    params: EbookSearchParams,
    logger?: RMABLogger
  ): Promise<EbookSearchResult[]> {
    try {
      logger?.info(`Searching ${source.name}...`);
      const results = await source.search(params, logger);
      logger?.info(`${source.name} returned ${results.length} result(s)`);
      return results;
    } catch (error) {
      logger?.error(
        `${source.name} search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return [];
    }
  }

  /**
   * Update source configuration (enable/disable, priority)
   */
  updateSourceConfig(
    sourceId: string,
    config: { enabled?: boolean; priority?: number }
  ): boolean {
    const source = this.sources.get(sourceId);
    if (!source) {
      logger.warn(`Source not found: ${sourceId}`);
      return false;
    }

    if (config.enabled !== undefined) {
      source.enabled = config.enabled;
    }
    if (config.priority !== undefined) {
      source.priority = config.priority;
    }

    logger.debug(`Updated config for ${sourceId}: ${JSON.stringify(config)}`);
    return true;
  }
}

// Singleton instance
const registry = new EbookSourceRegistry();

export { registry as ebookSourceRegistry, EbookSourceRegistry };
