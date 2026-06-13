// ---------------------------------------------------------------------------
// @media-scraper/core — built-in parser list
// ---------------------------------------------------------------------------

import type { MediaParser } from './types.js';
import { ImageParser } from './image.js';
import { BackgroundParser } from './background.js';
import { IframeParser } from './iframe.js';
import { VideoParser } from './video.js';
import { AudioParser } from './audio.js';
import { DocumentParser } from './document.js';
import { ShadowParser } from './shadow.js';

/**
 * The 7 built-in parsers in priority order (phase 1–7).
 */
export const BUILTIN_PARSERS: MediaParser[] = [
  ImageParser,
  BackgroundParser,
  IframeParser,
  VideoParser,
  AudioParser,
  DocumentParser,
  ShadowParser,
];
