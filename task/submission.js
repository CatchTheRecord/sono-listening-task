const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk'); // Import KoiiStorageClient

class Submission {
  constructor() {
    this.client = new KoiiStorageClient(); // Initialize KoiiStorageClient
  }

  /**
   * Koii task for tracking the user's radio listening activity.
   * @param {number} round - Round number
   */
  async task(round) {
    console.log(`Task started for round: ${round}`);

    // Fetch the node operator's username from the environment variables
    const username = process.env.USERNAME; // The username is set as a task variable

    if (!username) {
      console.error('No username found. Please set the USERNAME environment variable.');
      return;
    }

    // Fetch player data from your server endpoint for the specific username
    const playerData = await this.getPlayerDataFromServer(username);

    if (!playerData) {
      console.log(`No player data available for user: ${username}`);
      return;
    }

    // Cache data for the user's listening activity on the Koii node
    const isUpdated = await this.cachePlayerListeningDataIfUpdated(playerData);

    if (isUpdated) {
      console.log(`Player data for ${username} has been modified and updated in the cache.`);
    } else {
      console.log(`Player data for ${username} remains unchanged.`);
    }
  }

  /**
   * Fetch player listening data for a specific user from your server API.
   * @param {string} username - The username of the player
   * @returns {Promise<Object|null>} - Player data object or null if not found
   */
  async getPlayerDataFromServer(username) {
    try {
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }) // Pass the username to the server
      });

      if (!response.ok) {
        console.error('Server response error:', response.statusText);
        return null;
      }

      const playerData = await response.json();
      return playerData;
    } catch (error) {
      console.error('Error fetching data from the server:', error);
      return null;
    }
  }

  /**
   * Cache player listening data on the Koii node if the data has changed.
   * @param {Object} playerData - Player data (username, total_points, level, relics, etc.)
   * @returns {Promise<boolean>} - Returns true if the data was updated, otherwise false.
   */
  async cachePlayerListeningDataIfUpdated(playerData) {
    try {
      const cacheKey = `player_data_${playerData.username}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);

      if (cachedData) {
        const cachedPlayerData = JSON.parse(cachedData);

        // Compare total_points: if changed, update the cache
        if (this.isPlayerListeningDataChanged(cachedPlayerData, playerData)) {
          await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
          return true; // Data changed and was updated
        } else {
          return false; // Data remained the same
        }
      } else {
        // If no data is cached, store it
        await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
        return true; // New data was saved
      }
    } catch (error) {
      console.error('Error caching player data:', error);
      return false;
    }
  }

  /**
   * Check if player total_points have changed.
   * @param {Object} cachedData - Cached data
   * @param {Object} newData - New data
   * @returns {boolean} - True if total_points changed, otherwise false
   */
  isPlayerListeningDataChanged(cachedData, newData) {
    return cachedData.total_points !== newData.total_points; // We track the total_points field
  }
}

const submission = new Submission();
module.exports = { submission };
