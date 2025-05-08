/**
 * Utility functions for the WAJIK Anime Stremio addon
 */

/**
 * Maps anime data from WAJIK API to Stremio metadata format
 * @param {Object} anime - Anime object from API
 * @param {string} source - Source name
 * @returns {Object} - Stremio compatible metadata object
 */
function mapAnimeToStremio(anime, source) {
  // Basic required fields with fallbacks
  const meta = {
    id: `${source}:${anime.animeId || ''}`,
    type: 'series',
    name: anime.title || '',
    poster: anime.poster || '',
    posterShape: 'poster',
    background: anime.poster || '', // Use poster as background
    description: '',
    releaseInfo: '',
    genres: []
  };
  
  // Process description
  if (anime.synopsis && anime.synopsis.paragraphs && Array.isArray(anime.synopsis.paragraphs)) {
    meta.description = anime.synopsis.paragraphs.join('\n\n');
  }
  
  // Process genres
  if (anime.genreList && Array.isArray(anime.genreList)) {
    meta.genres = anime.genreList.map(genre => genre.title);
  }
  
  // Build release info
  const infoParts = [];
  
  if (anime.episodes !== undefined) {
    infoParts.push(`${anime.episodes} episodes`);
  }
  
  ['releaseDay', 'latestReleaseDate', 'status', 'type', 'releaseDate', 'releasedOn'].forEach(field => {
    if (anime[field]) infoParts.push(anime[field]);
  });
  
  meta.releaseInfo = infoParts.join(' | ');
  
  // Process score
  if (anime.score) {
    const scoreString = anime.score.toString().replace(',', '.');
    const scoreValue = parseFloat(scoreString);
    if (!isNaN(scoreValue)) {
      meta.imdbRating = scoreValue * 10; // Convert to 0-100 scale
    }
  }
  
  return meta;
}

/**
 * Extract episode information from episode ID
 * @param {string} episodeId - The episode ID in format "source:animeId:episodeNumber"
 * @returns {Object} - Object with source, animeId and episodeId
 */
function parseEpisodeId(episodeId) {
  const parts = episodeId.split(':');
  
  if (parts.length < 3) {
    throw new Error(`Invalid episode ID format: ${episodeId}`);
  }
  
  return {
    source: parts[0],
    animeId: parts[1],
    episodeId: parts[2]
  };
}

module.exports = {
  mapAnimeToStremio,
  parseEpisodeId
};