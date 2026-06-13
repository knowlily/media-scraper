// ---------------------------------------------------------------------------
// @media-scraper/core — parser registry
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';

/** Global registry of media parsers, keyed by name. */
const registry = new Map<string, MediaParser>();

/**
 * Register a media parser.
 *
 * If a parser with the same name is already registered it is overwritten.
 *
 * @param parser - The parser to register.
 *
 * @public
 */
export function registerParser(parser: MediaParser): void {
  registry.set(parser.name, parser);
}

/**
 * Return all registered parsers sorted by phase (ascending).
 *
 * @returns An array of registered parsers.
 *
 * @public
 */
export function getRegisteredParsers(): MediaParser[] {
  return Array.from(registry.values()).sort((a, b) => a.phase - b.phase);
}

/**
 * Clear all registered parsers (primarily for testing).
 *
 * After calling this, {@link getRegisteredParsers} returns an empty array
 * until new parsers are registered.
 *
 * @public
 */
export function clearParsers(): void {
  registry.clear();
}
